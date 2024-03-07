import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import { delay } from "../utils";
import axios from 'axios';
import { error } from "console";

export async function node(
    nodeId: number, // the ID of the node
    N: number, // total number of nodes in the network
    F: number, // number of faulty nodes in the network
    initialValue: Value, // initial value of the node
    isFaulty: boolean, // true if the node is faulty, false otherwise
    nodesAreReady: () => boolean, // used to know if all nodes are ready to receive requests
    setNodeIsReady: (index: number) => void // this should be called when the node is started and ready to receive requests
) {
  const node = express();
  node.use(express.json());
  node.use(bodyParser.json());

  let currentState: NodeState = {
    killed: false,
    x: null,
    decided: null,
    k: null,
  }

  let arrayR: number[][] = [];
  let arrayP: number[][] = [];
  arrayR[0] = [];
  arrayP[0] = [];

  //Fonction qui permet d'envoyer les messages à tous les nodes
  function sendMessages(k: number, x: Value, phase: string) {
    for (let i = 0; i < N; i++) {
      axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        k: k,
        x: x,
        phase: phase
      });
    }
  }

  node.get("/status", (req, res) => {
    if (isFaulty) {
      res.status(500).send("faulty");
    } else {
      res.status(200).send("live");
    }
  });

  node.get("/getState", (req, res) => {
    if (currentState){
      res.status(200).json(currentState);
    }
  });

  node.get("/stop", (req, res) => {
    currentState.killed = true;
    res.status(200).send("killed");
  });

  node.post("/message", async (req, res) => {
    let { k, x, phase } = req.body;

    if (!isFaulty && !currentState.killed) {

      if (phase == "Phase1") {
        if (arrayR[k] === undefined){
          arrayR[k] = [];
        }
        arrayR[k].push(x); //Stocker les messages

        //Si le nombre de messages reçus est atteint
        if (arrayR[k].length >= (N - F)) {
          let nb0R = arrayR[k].filter((value) => value == 0).length;
          let nb1R = arrayR[k].filter((value) => value == 1).length;
          if (nb0R > N/2) {
            x = 0;
          } else if (nb1R > N/2) {
            x = 1;
          } else {
            x = "?";
          }

          //On envoie les messages à la phase 2 (toujours le même round)
          sendMessages(k, x, 'Phase2');
        }
      }
      else if (phase == "Phase2") {
        if (arrayP[k] === undefined) {
          arrayP[k] = [];
        }
        arrayP[k].push(x); //Stocker les messages

        //Si le nombre de messages reçus est atteint
        if (arrayP[k].length >= (N - F)) {
          let nb0P = arrayP[k].filter((value) => value == 0).length;
          let nb1P = arrayP[k].filter((value) => value == 1).length;
          if (nb0P >= F + 1) {
            currentState.x = 0;
            currentState.decided = true;
          } else if (nb1P >= F + 1) {
            currentState.x = 1;
            currentState.decided = true;
          } else {
            if (nb0P + nb1P == 0) {
              currentState.x = Math.random() > 0.5 ? 1 : 0;
            } else {
              if (nb0P > nb1P) currentState.x = 0;
              else currentState.x = 1;
            }

            //On renvoie les messages en Phase 1 - round suivant
            currentState.k = k + 1;
            if (currentState.k) sendMessages(currentState.k, currentState.x, 'Phase1');
          }
        }
      }
    }
    res.status(200).send("Message received and processed.");
  });

  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) {
      await delay(50);
    }

    //Si le node n'est pas faulty on initialise le currentState
    if (!isFaulty) {
      currentState.k = 1;
      currentState.x = initialValue;
      currentState.decided = false;

      //On envoie les messages à tous les nodes
      sendMessages(currentState.k, currentState.x, 'Phase1');
    }
    
    res.status(200).send("Success");
  });

  // Start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
