/**
 * Legacy compatibility export.
 *
 * New code should import WorkspaceFileAdapter. This alias remains so older
 * provider storage modules and tests can migrate gradually.
 */

export { WorkspaceFileAdapter as VaultFileAdapter } from './WorkspaceFileAdapter';
