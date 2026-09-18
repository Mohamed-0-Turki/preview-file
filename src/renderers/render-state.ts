export interface RenderAttachment {
  destroy(): void
}

/**
 * Per-container attachment storage for renderers.
 *
 * Every renderer stores lightweight, container-scoped teardown objects (DOM
 * nodes to remove, observer handles, revoked URLs).  `createRenderState`
 * replaces the duplicated `WeakMap<HTMLElement, XAttachment>` field that
 * every renderer previously defined by hand.
 */
export function createRenderState<T extends RenderAttachment>() {
  const attachments = new WeakMap<HTMLElement, T>()

  return {
    /** Register (or replace) the teardown object for `container`. */
    set(container: HTMLElement, attachment: T): void {
      attachments.set(container, attachment)
    },

    /** Run `attachment.destroy()` for `container` and remove the record. */
    destroyFor(container: HTMLElement): void {
      const attachment = attachments.get(container)
      if (!attachment) return
      attachment.destroy()
      attachments.delete(container)
    },
  }
}