export type ScreenPhase = "idle" | "rolling" | "slowing" | "result";

export type ScreenPoolPerson = {
  id: number;
  emp_no: string;
  name: string;
  department: string;
};

export type ScreenWinner = {
  participantId: number;
  empNo: string;
  name: string;
  department: string;
  rank: number;
};

export type ScreenState = {
  phase: ScreenPhase;
  prizeId: number | null;
  prizeName: string | null;
  roundId: number | null;
  pool: ScreenPoolPerson[];
  winners: ScreenWinner[];
  resultHash: string | null;
  updatedAt: string;
};

export type WsMessage = { type: "sync" | "phase"; state: ScreenState };