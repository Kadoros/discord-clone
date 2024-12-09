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

  const handleJoinRoom = async () => {
    // await startMediaStream();
    await getMedia(); // Get user's media stream
    await initWebRTC(); // Create WebRTC connection
    socket.emit("join_room", roomId);
  };

  useEffect(() => {
    if (socket && isConnected) {
      handleJoinRoom(); // Trigger join room automatically
    }
  }, [socket, isConnected]);

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
    const constraints: MediaStreamConstraints = deviceId
      ? { audio, video: { deviceId: { exact: deviceId } } }
      : { audio, video };

    try {
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (!stream) {
        console.log("no stream");
      }
      setMediaStream(stream);
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = stream;
      }
      await getCameras();
    } catch (err) {
      console.error("Error accessing media devices:", err);
    }
  };

  useEffect(() => {
    if (mediaStream) {
      initWebRTC();
    }
  }, [mediaStream]);

  const initWebRTC = async () => {
    if (!mediaStream) {
      console.error("Stream is not available.");
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

    // Handling added stream
    pc.addEventListener("track", (event: RTCTrackEvent) => {
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = event.streams[0];
      }
    });

    // Adding tracks from the local stream to the peer connection
    mediaStream.getTracks().forEach((track) => pc.addTrack(track, mediaStream));

    // Saving the peer connection
    setPeerConnection(pc);
  };

  

  const handleCameraChange = (deviceId: string) => {
    getMedia(deviceId);
  };

  useEffect(() => {
    if (socket && isConnected) {
      // WebRTC signaling and connection management
      socket.on("welcome", async () => {
        console.log("welcome to ", roomId);
        if (peerConnection) {
          const dc = peerConnection.createDataChannel("dataChannel");
          setDataChannel(dc);
          const offer = await peerConnection.createOffer();
          await peerConnection.setLocalDescription(offer);
          socket.emit("offer", offer, roomId);
        }
      });

      socket.on("offer", async (offer: RTCSessionDescriptionInit) => {
        // Handle incoming offer and set up data channel
        peerConnection?.addEventListener("datachannel", (dataChannelEvent) => {
          const dc = dataChannelEvent.channel;
          setDataChannel(dc);
        });
        // Respond to offer with an answer
        await peerConnection?.setRemoteDescription(offer);
        const answer = await peerConnection?.createAnswer();
        await peerConnection?.setLocalDescription(answer!);
        socket.emit("answer", answer, roomId);
      });

      socket.on("answer", (answer: RTCSessionDescriptionInit) => {
        try {
          // Validate answer before setting
          if (!answer.type || !answer.sdp) {
            console.error("Invalid answer: Missing type or SDP", answer);
            return;
          }

          peerConnection
            ?.setRemoteDescription(answer)
            .then(() => {
              // Process queued ICE candidates
              iceCandidateQueue.forEach((candidate) => {
                peerConnection.addIceCandidate(candidate).catch(console.error);
              });
              setIceCandidateQueue([]);
            })
            .catch((error) => {
              console.error("Error setting remote description:", error);
              // Optionally, reset connection or retry
            });
        } catch (error) {
          console.error("Exception in answer handling:", error);
        }
      });

      socket.on("ice", (ice: RTCIceCandidateInit) => {
        if (peerConnection?.remoteDescription) {
          peerConnection.addIceCandidate(ice).catch(console.error);
        } else {
          setIceCandidateQueue((prevQueue) => [
            ...prevQueue,
            new RTCIceCandidate(ice),
          ]);
        }
      });
    } else {
      console.log("Socket is not connected or not available");
    }
  }, [socket, isConnected, roomId, iceCandidateQueue, peerConnection]);

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
        <video
          ref={remoteVideoRef}
          autoPlay
          playsInline
          className="rounded-lg border border-gray-300 shadow-md w-full h-64 bg-black"
        />
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
