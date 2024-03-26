import bodyParser from "body-parser"; 
import express from "express";   
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import http from "http";    
import { delay } from "../utils";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {

  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  // Initial state of the node
  let curNodeState: NodeState = {
    killed: false,
    x: null,
    k: null,
    decided: null,
  };

  // Propositions and votes received by the node
  let proposals: Map<number, Value[]> = new Map();
  let votes: Map<number, Value[]> = new Map();

  node.get("/status", (req, res) => {
    res.status(isFaulty ? 500 : 200).send(isFaulty ? "faulty" : "live");
  });

  // Route to kill the node
  node.get("/stop", (req, res) => {
    curNodeState.killed = true;
    res.status(200).send("killed");
  });

  // Route to get the state of the node
  node.get("/getState", (req, res) => {
    res.status(200).send(curNodeState);
  });

  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(4);
    }
    if (!isFaulty) {
      curNodeState = { k: 1, x: initialValue, decided: false, killed: curNodeState.killed };
      for (let i = 0; i < N; i++)
      {
      sendMessage(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        k: curNodeState.k,
        x: curNodeState.x,
        messageType: "propose"
      });
      }
    } else {

      curNodeState = { k: null, x: null, decided: null, killed: curNodeState.killed };
    }

    res.status(200).send("L'algorithme de consensus a démarré.");
  });

  // Route to handle incoming messages
  node.post("/message", async (req, res) => {
 
    let { k, x, messageType } = req.body;
     if (!isFaulty && !curNodeState.killed) {
      if (messageType=="propose")
      {

        if (!proposals.has(k))
        {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x);
        let prop = proposals.get(k)!;
        if (prop.length >= (N - F))
        {

        let count_0 =  prop.filter((el) => el == 0).length;

        let count_1 = prop.filter((el) => el == 1).length;
        if (count_0 > (N / 2)) {
          x = 0;
        } else if (count_1 > (N / 2)) {
          x = 1;
        } else {
          x = "?";
        }
        for (let i = 0; i < N; i++) {
            sendMessage(`http://localhost:${BASE_NODE_PORT + i}/message`, { k: k, x: x, messageType: "vote" });
        }
        }
      } else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x);

        let vote = votes.get(k)!;
        if (vote.length >= (N - F)) {
          let count0 = vote.filter((el) => el == 0).length;
          let count1 = vote.filter((el) => el == 1).length;
          if (count0 >= F+1)
          {
            curNodeState.x = 0;
            curNodeState.decided = true;
          } else if (count1 >= F + 1)
          {
            curNodeState.x = 1;
            curNodeState.decided = true;
          } else {
            // Randomly decide the value if there is no majority
            curNodeState.x = Math.random() > 0.5 ?  0:1;
            curNodeState.k = k + 1;

            for (let i=0; i<N; i++) {
              sendMessage(`http://localhost:${BASE_NODE_PORT+i}/message`, { k:curNodeState.k, x:curNodeState.x, messageType:"propose" });
            }
          }
        }
      }
    }
    res.status(200).send("Message received");
  });

  // Start the node server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Noeud ${nodeId} écoute sur le port ${BASE_NODE_PORT + nodeId}`);
    // the node is now ready to receive requests
    setNodeIsReady(nodeId);
  });
  return server;
}

// Function to send messages to other nodes
function sendMessage(url: string, body: any) {
  const options = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    }
  };

  const request = http.request(url, options, (response) => {
    let data = '';
    response.on('data', (ch) => {
      data += ch;
    });
    response.on('end', () => {
      try {
        const contentType = response.headers['content-type'];

        if (contentType && contentType.includes('application/json')) JSON.parse(data);
      } catch (error) {
        console.error(error);
      }
    });
  });
  request.on('error', (err) => { console.error(err); });
  request.write(JSON.stringify(body));
  request.end();
}