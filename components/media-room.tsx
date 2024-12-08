"use client";

import { useEffect, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Channel } from "@prisma/client";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import VideoChat from "@/components/chat/video-chat";
import { useSocket } from "@/components/providers/socket-provider";

interface MediaRoomProps {
  chatId: string;
  video: boolean;
  audio: boolean;
}

export const MediaRoom = ({ chatId, video, audio }: MediaRoomProps) => {
  const { user } = useUser();
  const [token, setToken] = useState("");
  const [IsLoading, setIsLoading] = useState(false);

  const { socket, isConnected } = useSocket();

  // useEffect(() => {
  //     if (!user?.firstName || !user?.lastName) return;

  //     const name = `${user.firstName} ${user.lastName}`;

  //     (async () => {
  //         try{
  //             const resp = await fetch(`/api/livekit?room=${chatId}&username=${name}`);
  //             const data = await resp.json();
  //             setToken(data.token);
  //         } catch (e) {
  //             console.log(e);
  //         }
  //     })()
  // }, [user?.firstName, user?.lastName, chatId]);

  useEffect(() => {
    if (socket && isConnected) {
      console.log("Socket connected, emitting join_room...");
      socket.emit("join_room", chatId);
      console.log("join_room", chatId);
  
      socket.on("welcome", async () => {
        console.log("welcome to ", chatId);
      });
  
      return () => {
        socket.off("welcome");
      };
    } else {
      console.log("Socket is not connected or not available");
    }
  }, [socket, isConnected, chatId]);

  if (IsLoading) {
    return (
      <div className="flex flex-col flex-1 justify-center items-center">
        <Loader2 className="h-7 w-7 text-zinc-500 animate-spin my-4" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div>
      asd
      <VideoChat />
    </div>
  );
};
