import type { FastifyInstance } from 'fastify';
import type { WebSocket } from 'ws';
import type { ClientMessage, ServerMessage } from '../../shared/types.js';
import { createRoom, joinRoom, leaveRoom, kickParticipant, handleDisconnect, reconnectParticipant, startFiltering, setReady, setUnready, setDeckOptions, handleSwipe, handleRequestCards, handleSelectMatch, handleRegretMatch } from '../services/room-manager.js';

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === 1) {
    socket.send(JSON.stringify(message));
  }
}

export default async function wsRoutes(fastify: FastifyInstance) {
  fastify.get('/ws', { websocket: true }, (socket: WebSocket) => {
    // CRITICAL: Attach handlers synchronously — no async before this

    // Track heartbeat pong responses
    (socket as any).isAlive = true;
    socket.on('pong', () => {
      (socket as any).isAlive = true;
    });

    socket.on('message', async (raw: Buffer) => {
      try {
        const msg = JSON.parse(raw.toString()) as ClientMessage;

        switch (msg.type) {
          case 'create_room': {
            const result = createRoom(socket, msg.nickname);
            if (typeof result === 'string') {
              send(socket, { type: 'error', message: result });
            } else {
              send(socket, { type: 'room_created', room: result });
            }
            break;
          }
          case 'join_room': {
            const result = joinRoom(socket, msg.code, msg.nickname);
            if (typeof result === 'string') {
              send(socket, { type: 'error', message: result });
            } else {
              send(socket, { type: 'room_joined', room: result });
            }
            break;
          }
          case 'leave_room': {
            leaveRoom(socket);
            break;
          }
          case 'kick': {
            kickParticipant(socket, msg.targetId);
            break;
          }
          case 'reconnect': {
            const result = reconnectParticipant(socket, msg.sessionToken);
            if (typeof result === 'string') {
              send(socket, { type: 'error', message: result });
            } else {
              send(socket, { type: 'reconnected', room: result.roomInfo });
              for (const msg of result.replay) {
                send(socket, msg);
              }
            }
            break;
          }
          case 'set_deck_options': {
            setDeckOptions(socket, msg.options);
            break;
          }
          case 'start_filtering': {
            startFiltering(socket);
            break;
          }
          case 'set_ready': {
            await setReady(socket, msg.filterState);
            break;
          }
          case 'set_unready': {
            await setUnready(socket);
            break;
          }
          case 'swipe': {
            handleSwipe(socket, msg.ratingKey, msg.direction);
            break;
          }
          case 'request_cards': {
            handleRequestCards(socket, msg.count);
            break;
          }
          case 'select_match': {
            handleSelectMatch(socket, msg.ratingKey);
            break;
          }
          case 'regret_match': {
            handleRegretMatch(socket, msg.ratingKey);
            break;
          }
          default:
            send(socket, { type: 'error', message: 'Unknown message type' });
        }
      } catch {
        send(socket, { type: 'error', message: 'Invalid message format' });
      }
    });

    socket.on('close', () => {
      handleDisconnect(socket);
    });

    socket.on('error', (err) => {
      fastify.log.error(err, 'WebSocket error');
    });
  });
}
