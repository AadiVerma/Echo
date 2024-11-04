import express, { Request, Response } from 'express';
import { client } from '@repo/database/client'
import jwt from "jsonwebtoken";

const JWT_SECRET = process.env.JWT_SECRET||"ujjawal";


import { signUpvalidations, signInvalidations,userDetailsValidation } from '../validations/validations';

const router = express.Router();

router.post("/signup", async (req: Request, res: any) => {
    const validation = signUpvalidations.safeParse(req.body);

    if (!validation.success) {
        return res.status(400).json({ message: "Failed to sign up", errors: validation.error });
    }

    const { username, password, email } = validation.data;

    try {
        const newUser = await client.user.create({
            data: {
                username,
                password,
                email,
               
            },
        });

        return res.status(201).json({ message: "User created successfully", user: newUser });
    } catch (error) {
        console.error("Error signing up:", error);
        return res.status(500).json({ message: "Error creating user" });
    }
});
router.post("/signin", async (req: Request, res: any) => {
  
    console.log("password");
    const validations = signInvalidations.safeParse(req.body);
    
    if (!validations.success) {
        return res.status(400).json({ message: "Failed to sign in", errors: validations.error });
    }

    const { email, password } = validations.data;

    try {
        const user = await client.user.findUnique({
            where: {
                email: email,
                password: password
            }
        });

        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }

        const token = jwt.sign(
            {
                id: user.id,        
                username: user.email, 
            },
            JWT_SECRET,
            { expiresIn: "1h" }  
        );

        return res.json({
            message: "Logged in successfully",
            token,   
            user: {
                id: user.id,
                username: user.username,
                email: user.email
            }
        });
    } catch (error) {
        console.error("Error signing in:", error);
        return res.status(500).json({ message: "Something went wrong", error });
    }
})

  router.post('/userdetails', async (req: Request, res: any) => {
    const { email } = req.body; 
    const validation = userDetailsValidation.safeParse(req.body);
  console.log(email,validation)
    if (!validation.success) {
      return res.status(400).json({ message: "Validation failed", errors: validation.error });
    }
  
    const { bio, gender, interests, profilePic } = validation.data;
  
    try {
      const updatedUser = await client.user.update({
        where: { email },
        data: {
          bio,
          gender,
          interests,
          profilePic,
        },
      });
  
      return res.status(200).json({ message: "User details updated successfully", user: updatedUser });
    } catch (error) {
      console.error("Error updating user details:", error);
      return res.status(500).json({ message: "Error updating user details" });
    }
  });
router.delete('/deleteMessage/:id',async(req:Request,res:any)=>{
    try {
        const response=await client.message.delete({
            where:{
                id:req.params.id
            }
        })
        console.log(response);
        return res.status(200).json(response)
    } catch (error) {
        return res.status(400).send("Error occurred")
    }
})
router.get('/getallconversations/:id', async (req: express.Request, res: any) => {
    try {
        const conversations = await client.conversation.findMany({
            where: {
                participants: {
                    some: {
                        userId: req.params.id 
                    }
                }
            },
            include: {
                participants: {
                    select: {
                        userId: true,
                        conversationId:true
                    }
                }
            }
        });

        if (!conversations.length) {
            return res.status(404).json({ message: "No conversations found for this user" });
        }

        const userConvoMap:any = {};

        conversations.forEach(conversation => {
            conversation.participants.forEach(participant => {
                if (participant.userId !== req.params.id) { // Exclude current user
                    if (!userConvoMap[participant.userId]) {
                        userConvoMap[participant.userId] = [];
                    }
                    userConvoMap[participant.userId].push(participant.conversationId);
                }
            });
        });

        const uniqueUserIds = Object.keys(userConvoMap);

        const uniqueUsers = await client.user.findMany({
            where: {
                id: {
                    in: uniqueUserIds
                }
            }
        });

        const response = uniqueUsers.map(user => ({
            ...user,
            conversationIds: userConvoMap[user.id] || [] 
        }));

        return res.json(response);
    } catch (error) {
        console.error("Error fetching user data:", error);
        return res.status(500).json({ message: "Error fetching user data" });
    }
});
router.get('/getmessages/:id', async (req: Request, res: any) => {
    try {
        let messages = await client.message.findMany({
            where: {
                conversationId: req.params.id, 
            }
        });
        const primarymessage={
            id:'1',
            conversationId:'1',
            senderId:'1',
            body:'Messages are end-to-end encrypted, No one outside of this chat can read them',
            createdAt:new Date(),
            updatedAt:new Date()
        }
        messages=[primarymessage,...messages]
        return res.json(messages);
    } catch (error) {
        console.error(error); 
        return res.status(500).json({ message: "Internal server error" });
    }
});
router.post("/addconvp",async(req:any,res:any)=>{
    const {conversationId,senderId,body}=req.body;
    console.log(conversationId,senderId,body);
    try{
        const userExists = await client.user.findUnique({
            where: { id: senderId }
        });
        if (!userExists) {
            return res.status(400).json({ message: "Invalid senderId" });
        }

        const message = await client.message.create({
            data: {
                conversationId,
                senderId,
                body
            },
        });
          return res.status(201).json({"msg":"Success","message":message});
    }
    catch(error){
        return res.status(error).json({ message:error})
    }
})
router.post('/linkusers', async (req: Request, res: any) => {
    const { userId1, userId2 } = req.body;
    console.log(userId1,userId2);
    if (!userId1 || !userId2) {
        return res.status(400).json({ message: "Both userId1 and userId2 are required" });
    }

    try {
        // Check if a conversation already exists between these two users
        const existingConversation = await client.conversation.findFirst({
            where: {
                participants: {
                    every: {
                        OR: [
                            { userId: userId1 },
                            { userId: userId2 }
                        ]
                    }
                }
            },
            include: { participants: true }
        });

        let conversation;
        if (existingConversation) {
            // If a conversation already exists, use it
            conversation = existingConversation;
        } else {
            // Otherwise, create a new conversation
            conversation = await client.conversation.create({
                data: {
                    participants: {
                        create: [
                            { userId: userId1 },
                            { userId: userId2 }
                        ]
                    }
                },
                include: { participants: true }
            });
        }

        return res.status(200).json({
            message: "Conversation linked successfully",
            conversationId: conversation.id,
            participants: conversation.participants
        });

    } catch (error) {
        console.error("Error linking users to conversation:", error);
        return res.status(500).json({ message: "Internal server error" });
    }
});
export default router;
