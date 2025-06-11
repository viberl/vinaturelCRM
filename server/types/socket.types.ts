import { Socket, Server as SocketIOServer, DefaultEventsMap } from 'socket.io';

// Authentication data sent during handshake
export interface SocketAuthData {
  token?: string;
}

// User data that will be stored in the socket
export interface SocketUserData {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  customerNumber: string;
  role: string;
  contextToken?: string;
}

// Data that will be attached to the socket
export interface SocketData {
  user: SocketUserData | null;
}

// Client to server events
export interface ClientToServerEvents {
  // Define client-to-server events here
  // Example:
  // message: (data: { text: string }) => void;
}

// Server to client events
export interface ServerToClientEvents {
  // Define server-to-client events here
  // Example:
  // message: (data: { from: string; text: string }) => void;
}

// Extended Socket type with our custom data
export type CustomSocket = Socket<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData> & {
  user?: SocketUserData; // For backward compatibility
  data: SocketData; // Ensure data is properly typed
};

// Type for the Socket.IO server with our custom types
type ServerType = SocketIOServer<ClientToServerEvents, ServerToClientEvents, DefaultEventsMap, SocketData>;

export interface CustomSocketIOServer extends ServerType {
  // Add any custom server methods here if needed
}
