import { WebSocketServer } from "ws";

export class SocketServer {
  constructor({ server, battleEngine, eventRouter }) {
    this.wss = new WebSocketServer({ server });
    this.battleEngine = battleEngine;
    this.eventRouter = eventRouter;

    this.wss.on("connection", (socket) => {
      socket.send(
        JSON.stringify({
          type: "state",
          payload: this.battleEngine.getStateSnapshot()
        })
      );
    });

    this.battleEngine.on("state", (snapshot) => {
      this.broadcast({
        type: "state",
        payload: snapshot
      });
    });

    this.eventRouter.on("event", (event) => {
      this.broadcast({
        type: "event",
        ...event
      });
    });
  }

  broadcast(payload) {
    const message = JSON.stringify(payload);

    for (const client of this.wss.clients) {
      if (client.readyState === 1) {
        client.send(message);
      }
    }
  }

  close() {
    this.wss.close();
  }
}

export default SocketServer;
