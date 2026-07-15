export interface ProviderDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly capabilities: readonly string[];
}

export class ProviderCatalog {
  private readonly byId: ReadonlyMap<string, ProviderDefinition>;

  constructor(definitions: readonly ProviderDefinition[]) {
    const values = new Map<string, ProviderDefinition>();
    for (const definition of definitions) {
      if (values.has(definition.id)) throw new Error(`Duplicate provider id: ${definition.id}`);
      values.set(definition.id, Object.freeze({ ...definition, capabilities: Object.freeze([...definition.capabilities]) }));
    }
    this.byId = values;
  }

  list(): readonly ProviderDefinition[] {
    return [...this.byId.values()];
  }

  get(id: string): ProviderDefinition | null {
    return this.byId.get(id) ?? null;
  }
}
