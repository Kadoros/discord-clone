"use client";

import { useEffect, useRef, useState } from "react";
import { LiveKitRoom, VideoConference } from "@livekit/components-react";
import "@livekit/components-styles";
import { Channel } from "@prisma/client";
import { useUser } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import VideoChat from "@/components/chat/video-chat";
import { useSocket } from "@/components/providers/socket-provider";

import { Select } from "@radix-ui/react-select";
import {
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "./ui/select";
import { Button } from "./ui/button";

interface MediaRoomProps {
  roomId: string;
  video: boolean;
  audio: boolean;
}

interface CameraOption {
  label: string;
  deviceId: string;
  isActive: boolean;
}

export const MediaRoom = ({ roomId, video, audio }: MediaRoomProps) => {
  const { socket, isConnected } = useSocket();

  // const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);
  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);

  const [iceCandidateQueue, setIceCandidateQueue] = useState<RTCIceCandidate[]>(
    []
  );

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [cameraList, setCameraList] = useState<CameraOption[]>([]);

  const getCameras = async (mediaStream: MediaStream) => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const cameras = devices.filter((device) => device.kind === "videoinput");
      const currentCamera = mediaStream?.getVideoTracks()[0];
      const cameraOptions = cameras.map((camera) => ({
        label: camera.label || `Camera ${camera.deviceId}`,
        deviceId: camera.deviceId,
        isActive: camera.label === currentCamera?.label,
      }));

      setCameraList(cameraOptions);
    } catch (error) {
      console.log(error);
    }
  };

  const getMedia = async (deviceId?: string) => {
    const initialConstraints = {
      audio: true,
      video: { facingMode: "user" }, // Default to user-facing camera
    };
    const cameraConstraints = {
      audio: true,
      video: { deviceId: { exact: deviceId } }, // Use specific camera by ID
    };

    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia(
        deviceId ? cameraConstraints : initialConstraints
      );

      
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = mediaStream;
        
      }
      
      
      if (!deviceId) await getCameras(mediaStream);

      return mediaStream;
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  const initWebRTC = async (mediaStream:MediaStream) => {
    const pc = new RTCPeerConnection({
      iceServers: [
        {
          urls: [
            "stun:stun.l.google.com:19302",
            "stun:stun1.l.google.com:19302",
          ],
        },
      ],
    });
    pc.addEventListener("icecandidate", (data) => {
      socket.emit("ice", data.candidate, roomId);

    });
    pc.addEventListener("track", (event: RTCTrackEvent) => {
      if (remoteVideoRef.current) {

        const stream = event.streams[0];
        remoteVideoRef.current.srcObject = stream;
      }
    });
    console.log(mediaStream);
    

    mediaStream?.getTracks().forEach((track) => {
      pc.addTrack(track, mediaStream);
    });

    setPeerConnection(pc);
    return pc;
  };

  const initCallSetup = async () => {
    const mediaStream = await getMedia(); // Get user's media stream
    const pc = await initWebRTC(mediaStream!);


    setupSocketListeners(pc);
  };

  const initCall = async () => {
    await initCallSetup();

    socket.emit("join_room", roomId);
  };

  const setupSocketListeners = (pc: RTCPeerConnection) => {
    socket.on("welcome", async () => {
      if (!pc) {
        console.error("welcome on : Peer connection is null");
        return;
      }
      setDataChannel(pc?.createDataChannel("dataChannel"));

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit("offer", offer, roomId);
    });
    socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
      if (!pc) {
        console.error("Peer connection is null");
        return;
      }
      // Handle incoming offer and set up data channel
      pc?.addEventListener("datachannel", (dataChannelEvent) => {
        setDataChannel(dataChannelEvent.channel);
        dataChannel?.addEventListener("message", (e) => console.log(e.data));
        dataChannel?.addEventListener("open", () => dataChannel.send("hi"));
      });

      // Respond to offer with an answer
      await pc.setRemoteDescription(offer);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit("answer", answer, roomId);
    });
    socket.on("answer", (answer: RTCSessionDescriptionInit) => {
      if (!pc) {
        console.error("answer on : Peer connection is null");
        return;
      }
      // Set remote description from peer's answer
      pc.setRemoteDescription(answer).then(() => {
        // Process queued ICE candidates
        iceCandidateQueue.forEach((candidate) =>
          pc.addIceCandidate(candidate).catch(console.error)
        );
        setIceCandidateQueue([]);
      });
    });

    socket.on("ice", (ice: RTCIceCandidateInit) => {
      if (!pc) {
        console.error("ice on : Peer connection is null");
        return;
      }
      // Handle incoming ICE candidates
      if (pc.remoteDescription) {
        pc.addIceCandidate(ice).catch(console.error);
      } else {
        setIceCandidateQueue((prevQueue) => [
          ...prevQueue,
          new RTCIceCandidate(ice),
        ]);
      }
    });
  };

  if (!isConnected) {
    return (
      <div className="flex flex-col flex-1 justify-center items-center">
        <Loader2 className="h-7 w-7 text-zinc-500 animate-spin my-4" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  } else {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 p-4">
        <Button onClick={initCall}>Join</Button>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <video
            ref={localVideoRef}
            autoPlay
            muted
            playsInline
            className="rounded-lg border border-gray-300 shadow-md w-full h-64 bg-black"
          />
          <p>local</p>
          <video
            ref={remoteVideoRef}
            autoPlay
            muted
            playsInline
            className="rounded-lg border border-gray-300 shadow-md w-full h-64 bg-black"
          />
          <p>remote</p>
        </div>
        <Select onValueChange={(value) => {}}>
          <SelectTrigger>
            <SelectValue placeholder="Select Camera" />
          </SelectTrigger>
          <SelectContent>
            {cameraList.map((camera) => (
              <SelectItem key={camera.deviceId} value={camera.deviceId}>
                {camera.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    );
  }
};
