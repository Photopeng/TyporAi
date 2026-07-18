export const RPC_METHODS = [
  'system.initialize', 'system.health', 'system.getStatus', 'system.getDiagnostics', 'system.getCapabilities', 'system.prepareUpgrade', 'system.shutdown',
  'settings.getSnapshot', 'settings.applyPatch', 'settings.subscribe', 'settings.resetProvider', 'settings.validateEnvironment',
  'workspace.getCurrent', 'workspace.select', 'workspace.grant', 'workspace.revoke', 'workspace.detectFromDocument', 'workspace.getIndexStatus', 'workspace.search',
  'fs.stat', 'fs.list', 'fs.readText', 'fs.readBinary', 'fs.writeText', 'fs.rename', 'fs.remove', 'fs.createDirectory', 'fs.createBackup', 'fs.restoreBackup',
  'watch.subscribe', 'watch.unsubscribe', 'watch.resubscribe',
  'session.list', 'session.get', 'session.create', 'session.applyPatch', 'session.delete', 'session.fork', 'session.reloadHistory', 'session.getTabLayout', 'session.setTabLayout',
  'chat.createRuntime', 'chat.ensureReady', 'chat.startTurn', 'chat.steer', 'chat.cancelTurn', 'chat.rewind', 'chat.resetSession', 'chat.getCommands', 'chat.reloadMcp', 'chat.disposeRuntime', 'chat.getRuntimeState', 'chat.getSubagentToolCalls', 'chat.getSubagentFinalResult',
  'approval.resolve', 'userInput.resolve', 'planApproval.resolve',
  'provider.list', 'provider.getStatus', 'provider.getModels', 'provider.probeCli', 'provider.restart', 'provider.getRuntimeDiagnostics',
  'mcp.list', 'mcp.save', 'mcp.test', 'mcp.reload', 'skills.list', 'skills.read', 'agents.list', 'agents.save', 'agents.delete', 'agents.refresh',
  'blob.begin', 'blob.chunk', 'blob.commit', 'blob.abort',
] as const;

export type RpcMethod = typeof RPC_METHODS[number];

export function isRpcMethod(value: string): value is RpcMethod {
  return (RPC_METHODS as readonly string[]).includes(value);
}
