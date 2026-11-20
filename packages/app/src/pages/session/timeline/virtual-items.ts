// Copyright (c) 2026 onelpawarai. All rights reserved.

export function filterVirtualIndexes(indexes: number[], count: number) {
  return indexes.filter((index) => index >= 0 && index < count)
}
