export const SERVER_EVENTS = [
  'approval.request', 'approval.dismissed', 'userInput.request', 'planApproval.request', 'stream.resyncRequired',
] as const;

export type ServerEvent = typeof SERVER_EVENTS[number];
