// Copyright (c) 2026 onelpawarai. All rights reserved.

export interface Registration {
  readonly dispose: () => Promise<void>
}

export interface Reload {
  readonly reload: () => Promise<void>
}

export type Hooks<Spec> = {
  readonly [Name in keyof Spec]: (callback: (input: Spec[Name]) => Promise<void> | void) => Promise<Registration>
}
