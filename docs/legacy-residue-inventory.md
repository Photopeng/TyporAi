# Legacy residue inventory

The following terms require review before becoming user-visible: `Obsidian`, `Claudian`, `Vault`, `Note`, `Typora Provider`, and Obsidian image-link syntax.

Internal compatibility symbols such as `app.vault`, `getVaultPath`, and `VaultFileAdapter` are migration targets, not blanket deletion targets. New code should use Workspace and Document terminology; existing aliases remain only while callers migrate.
