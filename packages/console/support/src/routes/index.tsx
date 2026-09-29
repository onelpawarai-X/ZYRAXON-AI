// SPDX-License-Identifier: LicenseRef-ZYRAXON-ZSL-X
// Copyright (c) 2026 onelpawarai. All rights reserved.

import { Title } from "@solidjs/meta"

export default function SupportPage() {
  return (
    <main data-page="support">
      <Title>zyraxon support — lookup user</Title>
      <h1>Lookup user</h1>

      <form data-component="lookup" action="/lookup" method="get" target="_blank">
        <input
          type="text"
          name="identifier"
          placeholder="email, wrk_..., key_..., or sk-..."
          autocomplete="off"
          autofocus
          required
        />
        <button type="submit">Lookup</button>
      </form>
    </main>
  )
}
