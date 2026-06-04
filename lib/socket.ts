import { io, Socket } from "socket.io-client";
import { getAccessToken } from "./auth";

let socket: Socket | null = null;

// URL base del backend (sin /api/v1)
const SOCKET_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000/api/v1")
  .replace("/api/v1", "");

export function getSocket(): Socket {
  if (socket?.connected) return socket;

  const token = getAccessToken();

  socket = io(SOCKET_URL, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000,
  });

  return socket;
}

export function disconnectSocket(): void {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
