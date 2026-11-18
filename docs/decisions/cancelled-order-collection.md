# Collection after cancellation

Decision for FR26 and FR29: a cancelled project remains Cancelled while any requested blocks are uncollected. Existing ready blocks and active runs can still be completed and collected. When collections cover the entire original order, the displayed status becomes Collected.

FR26 defines Collected by fulfilment of the requested quantities. FR29 stops waiting work while retaining actual production, collection, and history. Therefore full collection takes precedence in the displayed status. This can happen when every required run had already started before cancellation. It does not restart cancelled work or reduce the original order.

The cancellation reason, cancellation event, estimate revisions, and collection history remain available after the status changes. A partial collection of the available stock keeps Cancelled even if no further runs can start. The requested quantities remain the reference for fulfilment.

`test_production.py` checks both partial collection after cancellation and complete collection of an order whose required run was already active. The frontend mock derives status in the same order.
