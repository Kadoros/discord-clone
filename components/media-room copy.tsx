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
  const { user } = useUser();
  const { socket, isConnected } = useSocket();

  const [peerConnection, setPeerConnection] =
    useState<RTCPeerConnection | null>(null);
  const [dataChannel, setDataChannel] = useState<RTCDataChannel | null>(null);
  const [iceCandidateQueue, setIceCandidateQueue] = useState<RTCIceCandidate[]>(
    []
  );

  const [mediaStream, setMediaStream] = useState<MediaStream | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const [cameraList, setCameraList] = useState<CameraOption[]>([]);

  const [isInitialized, setIsInitialized] = useState(false);
  const getCameras = async () => {
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

  const getMedia = async (deviceId?: string): Promise<void> => {
    const initialConstraints = {
      audio: true,
      video: { facingMode: "user" }, // Default to user-facing camera
    };
    const cameraConstraints = {
      audio: true,
      video: { deviceId: { exact: deviceId } }, // Use specific camera by ID
    };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(
        deviceId ? cameraConstraints : initialConstraints
      );

      setMediaStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      if (!deviceId) await getCameras();
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  const initWebRTC = async () => {
    if (!mediaStream) {
      console.error("Media stream is not available");
      return;
    }

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

    // Handling ICE candidates
    pc.addEventListener("icecandidate", (event: RTCPeerConnectionIceEvent) => {
      if (event.candidate) {
        socket.emit("ice", event.candidate, roomId);
      }
    });

    pc.addEventListener("track", (event: RTCTrackEvent) => {
      if (remoteVideoRef.current) {
        const stream = event.streams[0];
        remoteVideoRef.current.srcObject = stream;
      }
    });

    // Safely add tracks from the local stream to the peer connection

    mediaStream.getTracks().forEach((track) => {
      pc.addTrack(track, mediaStream);
    });

    // Saving the peer connection
    setPeerConnection(pc);
  };

  const handleCameraChange = (deviceId: string) => {
    getMedia(deviceId);
  };

  async function initCall() {
    if (!mediaStream) {
      await getMedia(); // Get user's media stream
      console.log("getMedia");
    }
    if (mediaStream) {
      await initWebRTC(); // Create WebRTC connection
      console.log("on initwbrtc");
    }

    console.log("pc initCall ", peerConnection);
  }

  const onStart = async () => {
    await initCall();
    setIsInitialized(true);
  };

  useEffect(() => {
    console.log(socket, mediaStream);

    if (socket) {
      onStart();
    }
  }, [socket, mediaStream]);

  useEffect(() => {
    if (!isInitialized || !socket || !isConnected) {
      console.log("Waiting for initialization or socket connection...");
      return;
    }

    console.log("Starting WebRTC signaling");
    console.log("pc useEffect ", peerConnection);
    console.log("socket", socket);

    const handleWelcome = async () => {
      console.log("on welcome");
      if (peerConnection) {
        try {
          const dc = await peerConnection.createDataChannel("dataChannel");
          setDataChannel(dc);

          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);

          console.log("emit offer");
          console.log("socket", socket);
          socket.emit("offer", offer, roomId);
        } catch (error) {
          console.error("Error handling welcome:", error);
        }
      }
    };

    const handleOffer = async (offer: RTCSessionDescriptionInit) => {
      console.log("on offer");
      if (!peerConnection) {
        console.error("Peer connection is null");
        return;
      }
    
      try {
        // Clear existing remote video stream before setting new one
        if (remoteVideoRef.current) {
          const existingStream = remoteVideoRef.current.srcObject as MediaStream | null;
          if (existingStream) {
            existingStream.getTracks().forEach(track => track.stop());
            remoteVideoRef.current.srcObject = null;
          }
        }
    
        await peerConnection.setRemoteDescription(offer);
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
    
        console.log("emit answer");
        console.log("socket", socket);
        socket.emit("answer", answer, roomId);
      } catch (error) {
        console.error("Error handling offer:", error);
      }
    };

    const handleAnswer = (answer: RTCSessionDescriptionInit) => {
      console.log("on answer");
      if (!peerConnection) {
        console.error("Peer connection is null");
        return;
      }

      if (!answer.type || !answer.sdp) {
        console.error("Invalid answer: Missing type or SDP", answer);
        return;
      }

      if (peerConnection.signalingState !== "stable") {
        console.warn(
          `Unexpected signaling state: ${peerConnection.signalingState}`
        );
        return;
      }

      peerConnection
        .setRemoteDescription(answer)
        .then(() => {
          iceCandidateQueue.forEach((candidate) => {
            peerConnection.addIceCandidate(candidate).catch(console.error);
          });
          setIceCandidateQueue([]);
        })
        .catch((error) => {
          console.error("Error setting remote description:", error);
        });
    };

    const handleIce = (ice: RTCIceCandidateInit) => {
      console.log("on ice");
      if (peerConnection?.remoteDescription) {
        peerConnection.addIceCandidate(ice).catch(console.error);
      } else {
        setIceCandidateQueue((prevQueue) => [
          ...prevQueue,
          new RTCIceCandidate(ice),
        ]);
      }
    };

    // Register socket event listeners
    console.log("socket event listener");
    socket.on("welcome", handleWelcome);
    console.log("handleWelcome");
    socket.on("offer", handleOffer);
    console.log("handleOffer");
    socket.on("answer", handleAnswer);
    console.log("handleAnswer");
    socket.on("ice", handleIce);
    console.log("handleIce");
    console.log("emit join_room");
    socket.emit("join_room", roomId);

    return () => {
      // Clean up listeners
      socket.off("welcome", handleWelcome);
      socket.off("offer", handleOffer);
      socket.off("answer", handleAnswer);
      socket.off("ice", handleIce);
    };
  }, [isInitialized, socket, isConnected]);

  if (!isConnected) {
    return (
      <div className="flex flex-col flex-1 justify-center items-center">
        <Loader2 className="h-7 w-7 text-zinc-500 animate-spin my-4" />
        <p className="text-xs text-zinc-500 dark:text-zinc-400">Loading...</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center space-y-4 p-4">
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
      <Select onValueChange={(value) => handleCameraChange(value)}>
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
};
