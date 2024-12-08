import React, { useEffect, useRef, useState } from 'react';

const VideoChat = () => {
  const myFaceRef = useRef<HTMLVideoElement | null>(null);
  const peersFaceRef = useRef<HTMLVideoElement | null>(null);
  const camerasSelectRef = useRef<HTMLSelectElement | null>(null);

  const [roomName, setRoomName] = useState('');

  useEffect(() => {
    // Add socket.io logic and video handling here
    // e.g., socket connection, camera stream setup, etc.
  }, []);

  const handleMute = () => {
    if (myFaceRef.current) {
      myFaceRef.current.muted = !myFaceRef.current.muted;
    }
  };

  const handleCamera = () => {
    if (myFaceRef.current) {
      // Logic to toggle camera on/off
      console.log('Toggling camera');
    }
  };

  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();
    // Logic to join the room using roomName
    console.log(`Joining room: ${roomName}`);
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-100 p-4">
      <header className="text-center mb-6">
        <h1 className="text-3xl font-bold">Video Chat</h1>
      </header>
      <main className="w-full max-w-lg bg-white rounded-lg shadow-lg p-6">
        <div id="welcome" className="mb-6">
          <form onSubmit={handleJoinRoom} className="flex flex-col space-y-4">
            <input
              type="text"
              required
              placeholder="Room name"
              value={roomName}
              onChange={(e) => setRoomName(e.target.value)}
              className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
            <button
              type="submit"
              className="py-2 px-4 bg-blue-500 text-white rounded-md hover:bg-blue-600"
            >
              Join
            </button>
          </form>
        </div>
        <div id="call" className="space-y-4">
          <div id="myStream" className="flex flex-col items-center space-y-2">
            <video
              id="myFace"
              ref={myFaceRef}
              autoPlay
              playsInline
              className="rounded-lg border border-gray-300"
              width="400"
              height="400"
            />
            <div className="flex space-x-4">
              <button
                id="mute"
                onClick={handleMute}
                className="py-2 px-4 bg-gray-300 rounded-md hover:bg-gray-400"
              >
                Mute
              </button>
              <button
                id="camera"
                onClick={handleCamera}
                className="py-2 px-4 bg-gray-300 rounded-md hover:bg-gray-400"
              >
                Turn Camera Off
              </button>
            </div>
            <select
              id="cameras"
              ref={camerasSelectRef}
              className="px-4 py-2 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {/* Options for cameras will be populated here */}
            </select>
          </div>
          <video
            id="peersFace"
            ref={peersFaceRef}
            autoPlay
            playsInline
            className="rounded-lg border border-gray-300"
            width="400"
            height="400"
          />
        </div>
      </main>
    </div>
  );
};

export default VideoChat;
