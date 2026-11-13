/**
 * Domain event bus for the organization protocol.
 *
 * The service publishes one {@link LoggedEvent} after each successful commit,
 * so a Runtime, CLI, or audit sink can subscribe without the domain core ever
 * depending on them. Delivery is synchronous and in append order: a subscriber
 * sees events exactly once, in the same order the log stores them.
 *
 * A failing listener never breaks a commit. Errors are routed to an optional
 * `onError` hook so hosts can log them without coupling the domain to a
 * logger.
 *
 * @module @compbotorg/task/bus
 */

import type { TaskEventType, LoggedEvent } from './events'

/** One published log entry as seen by subscribers. */
export type DomainEventListener = (entry: LoggedEvent) => void

/** Optional per-subscription filter. */
export interface SubscribeOptions {
  /** When present, deliver only events whose type is in this list. */
  readonly eventTypes?: readonly TaskEventType[]
}

/** Construction options for {@link EventBus}. */
export interface EventBusOptions {
  /** Called when a listener throws; defaults to swallowing the error. */
  readonly onError?: (error: unknown, entry: LoggedEvent) => void
}

/** Handle returned by {@link EventBus.subscribe}. */
export interface Subscription {
  /** Stop delivering further events to this listener. */
  unsubscribe(): void
}

interface RegisteredListener {
  readonly listener: DomainEventListener
  readonly eventTypes?: readonly TaskEventType[]
}

/** A minimal synchronous publish/subscribe hub. */
export class EventBus {
  private readonly registered: RegisteredListener[] = []
  private readonly onError: (error: unknown, entry: LoggedEvent) => void

  constructor(options: EventBusOptions = {}) {
    this.onError = options.onError ?? (() => undefined)
  }

  /**
   * Subscribe to published events.
   * @param listener - callback invoked once per matching commit.
   * @param options - optional type filter.
   * @returns a handle that removes the listener.
   */
  subscribe(listener: DomainEventListener, options: SubscribeOptions = {}): Subscription {
    const registration: RegisteredListener =
      options.eventTypes === undefined
        ? { listener }
        : { listener, eventTypes: options.eventTypes }
    this.registered.push(registration)
    return {
      unsubscribe: () => {
        const index = this.registered.indexOf(registration)
        if (index >= 0) this.registered.splice(index, 1)
      },
    }
  }

  /**
   * Subscribe to exactly one event type.
   * @param type - the event discriminant to listen for.
   * @param listener - callback invoked once per matching commit.
   * @returns a handle that removes the listener.
   */
  on(type: TaskEventType, listener: DomainEventListener): Subscription {
    return this.subscribe(listener, { eventTypes: [type] })
  }

  /**
   * Deliver one committed entry to every matching listener.
   * @param entry - the logged event to publish.
   */
  publish(entry: LoggedEvent): void {
    for (const registration of [...this.registered]) {
      if (
        registration.eventTypes !== undefined &&
        !registration.eventTypes.includes(entry.event.type)
      ) {
        continue
      }
      try {
        registration.listener(entry)
      } catch (error) {
        this.onError(error, entry)
      }
    }
  }

  /** Number of active listeners. */
  get listenerCount(): number {
    return this.registered.length
  }

  /** Remove every listener. */
  clear(): void {
    this.registered.length = 0
  }
}
