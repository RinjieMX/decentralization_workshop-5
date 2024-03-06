import bodyParser from "body-parser";
import express from "express";
import { BASE_NODE_PORT } from "../config";
import { Value, NodeState } from "../types";
import axios from "axios";
import { error } from 'console';
import {delay} from "../utils";

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
    k: null
  };

  let arrayR: number[][] = [];
  let arrayP: number[][] = [];
  arrayR[0] = [];
  arrayP[0] = [];

  async function sendMessage(k: number, x: Value, phase: string) {
    for (let i = 0; i < N; i++){
      axios.post(`http://localhost:${BASE_NODE_PORT + i}/message`, {
        k: k,
        x: x,
        phase: phase
      });
    }
  }

  node.get("/status", (req, res) => {
    if (isFaulty){
      res.status(500).send('faulty');
    }
    else {
      res.status(200).send('live');
    }
  });

  node.get("/start", async (req, res) => {
    while (!nodesAreReady()){
      await delay(50);
    }

    if (isFaulty) return res.status(500).send("The node is faulty");

    if (currentState.k === null) {
      currentState = {
        killed: false,
        x: initialValue,
        decided: false,
        k: 0
      }
    }

    if (currentState.k == null || currentState.x == null) return res.status(500).send("k or x are null");

    currentState.k = currentState.k + 1;
    error("start", nodeId, currentState.decided);
    if (currentState.decided === false) await sendMessage(currentState.k, currentState.x, 'Phase1');

    return res.status(200).send("Success");
  });

  node.post("/message", async (req, res) => {
    let { k, x, phase } = req.body;

    if (isFaulty) return res.status(500).send("Node is faulty");
    //error("decided", currentState.decided, nodeId);
    /*if (currentState.decided) {
      error(currentState.decided, nodeId);
      return res.status(200).json({ result: currentState.x });
    }*/

    //Dans le cas d'un proposal
    if (phase === 'Phase1') {
      if (arrayR[k] === undefined){
        arrayR[k] = [];
      }
      arrayR[k].push(x); //Stocker les messages
      //error(arrayR);

      //Si le nombre de messages reçus est atteint
      if (arrayR[k].length >= N - F) {
        const nb0R = arrayR[k].filter((value) => value === 0).length;
        const nb1R = arrayR[k].filter((value) => value === 1).length;
        if (nb0R >= arrayR[k].length/2) {
          x = 0;
        } else if (nb1R >= arrayR[k].length/2) {
          x = 1;
        } else {
          x = "?";
        }

        //On renvoie les messages en phase Phase2
        error("phase 1", nodeId, currentState);
        await sendMessage(k, x, 'Phase2');
      }

      //Sinon, le prochain message retestera les conditions
    }
    //Dans le cas d'un vote
    else if (phase === 'Phase2'){
      if (arrayP[k] === undefined) {
        arrayP[k] = [];
      }
      arrayP[k].push(x);

      //Si le nombre de messages reçus est atteint
      if (arrayP[k].length >= N - F) {
        const nb0P = arrayP[k].filter((value) => value === 0).length;
        const nb1P = arrayP[k].filter((value) => value === 1).length;
        //error(nb0P, nb1P);
        //error(F + 1)
        if (nb0P >= F + 1) {
          currentState.decided = true;
          currentState.x = 0;
        } else if (nb1P >= F + 1){
          currentState.decided = true;
          currentState.x = 1;
        } else if (nb0P + nb1P == 0) {
          currentState.x = Math.random() > 0.5 ? 1 : 0;
        } else {
          if (nb0P > nb1P) currentState.x = 0;
          else currentState.x = 1;
        }
      }

      error("phase 2", nodeId, currentState);
      if (currentState.decided == false){
        await axios.get(`http://localhost:${BASE_NODE_PORT + nodeId}/start`);
      }
    }
    return res.status(200).send("Message received");
  });

  node.get("/stop", async (req, res) => {
    currentState.killed = true;
    res.status(200).send('Node stopped');
  });

  node.get("/getState", (req, res) => {
    if (currentState){
      res.status(200).json(currentState);
    }
  });

  // start the server
  const server = node.listen(BASE_NODE_PORT + nodeId, async () => {
    console.log(
      `Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`
    );

    // the node is ready
    setNodeIsReady(nodeId);
  });

  return server;
}
