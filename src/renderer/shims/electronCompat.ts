/** The Sidecar renderer never loads Node's events module into Typora. */
export function patchSetMaxListenersForElectron(): void {}
