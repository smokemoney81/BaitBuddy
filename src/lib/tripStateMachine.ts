/**
 * Trip State Machine
 *
 * Enforces strict state transitions for fishing trips throughout their lifecycle.
 * Prevents invalid state changes (e.g., IDLE → ACTIVE without prep) and provides
 * a type-safe API for state management.
 *
 * State Flow:
 *   IDLE → PLANNING → PREPARING → ACTIVE → ANALYZING → COMPLETED
 *
 *   At any point, can transition to CANCELLED (terminal)
 *   From IDLE, can go directly to COMPLETED (empty trip)
 *
 * Guarantees:
 * - State transitions are deterministic and validated before applying
 * - Invalid transitions throw with clear error messages
 * - Immutable transitions prevent accidental state corruption
 * - Can be integrated with Redux/Context for app-wide state management
 */

export type TripState =
  | 'IDLE'           // Initial state, not yet started
  | 'PLANNING'       // User selecting date, location, target fish
  | 'PREPARING'      // User selecting gear, spots, weather review
  | 'ACTIVE'         // Fishing in progress, logging catches
  | 'ANALYZING'      // Trip ended, reviewing results
  | 'COMPLETED'      // Trip finalized and archived
  | 'CANCELLED';     // Trip abandoned (terminal state)

export type TripEvent =
  // Forward transitions
  | 'START_PLANNING'    // IDLE → PLANNING
  | 'CONFIRM_PLAN'      // PLANNING → PREPARING
  | 'START_FISHING'     // PREPARING → ACTIVE
  | 'END_FISHING'       // ACTIVE → ANALYZING
  | 'FINALIZE'          // ANALYZING → COMPLETED
  | 'QUICK_COMPLETE'    // IDLE → COMPLETED (skip if unused)

  // Backward transitions (limited)
  | 'BACK_TO_PLANNING'  // PREPARING → PLANNING
  | 'BACK_TO_PREP'      // ANALYZING → ACTIVE (reopen for late catch)

  // Cancel (always allowed)
  | 'CANCEL';           // ANY → CANCELLED

export interface TripStateContext {
  state: TripState;
  createdAt: Date;
  startedAt?: Date;
  endedAt?: Date;
  cancelledAt?: Date;
  catches: number;
  spotIds: string[];
  gearIds: string[];
  notes?: string;
  metadata?: Record<string, any>;
}

export interface StateTransition {
  from: TripState;
  to: TripState;
  event: TripEvent;
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * Defines valid state transitions
 * Each state maps to the states it can transition to
 */
const STATE_TRANSITIONS: Record<TripState, TripEvent[]> = {
  IDLE: ['START_PLANNING', 'QUICK_COMPLETE', 'CANCEL'],
  PLANNING: ['CONFIRM_PLAN', 'CANCEL'],
  PREPARING: ['START_FISHING', 'BACK_TO_PLANNING', 'CANCEL'],
  ACTIVE: ['END_FISHING', 'CANCEL'],
  ANALYZING: ['FINALIZE', 'BACK_TO_PREP', 'CANCEL'],
  COMPLETED: ['CANCEL'], // Can only cancel a completed trip (unarchive)
  CANCELLED: [], // Terminal state, no further transitions
};

/**
 * Maps events to target states
 */
const EVENT_TO_STATE: Record<TripEvent, TripState> = {
  START_PLANNING: 'PLANNING',
  CONFIRM_PLAN: 'PREPARING',
  START_FISHING: 'ACTIVE',
  END_FISHING: 'ANALYZING',
  FINALIZE: 'COMPLETED',
  QUICK_COMPLETE: 'COMPLETED',
  BACK_TO_PLANNING: 'PLANNING',
  BACK_TO_PREP: 'ACTIVE',
  CANCEL: 'CANCELLED',
};

/**
 * Validates a state transition without applying it
 */
export function validateTransition(from: TripState, event: TripEvent): boolean {
  return STATE_TRANSITIONS[from]?.includes(event) ?? false;
}

/**
 * Attempts a state transition and returns the result
 * Throws if transition is invalid
 */
export function applyTransition(from: TripState, event: TripEvent): TripState {
  if (!validateTransition(from, event)) {
    throw new InvalidStateTransitionError(
      `Cannot transition from ${from} via ${event}`,
      from,
      event,
      getValidTransitions(from)
    );
  }
  return EVENT_TO_STATE[event];
}

/**
 * Get all valid events from a given state
 */
export function getValidTransitions(from: TripState): TripEvent[] {
  return STATE_TRANSITIONS[from] || [];
}

/**
 * Get all states that can transition to a target state
 * Useful for debugging and validation
 */
export function getIncomingStates(target: TripState): TripState[] {
  return Object.entries(STATE_TRANSITIONS)
    .filter(([_state, events]) =>
      Object.entries(EVENT_TO_STATE)
        .filter(([event]) => events.includes(event))
        .some(([_ev, state]) => state === target)
    )
    .map(([state]) => state as TripState);
}

/**
 * Check if a state is terminal (no further transitions possible)
 */
export function isTerminalState(state: TripState): boolean {
  return STATE_TRANSITIONS[state].length === 0 || state === 'CANCELLED';
}

/**
 * Check if a trip is still active (not completed or cancelled)
 */
export function isActiveTripState(state: TripState): boolean {
  return state === 'IDLE' || state === 'PLANNING' || state === 'PREPARING' || state === 'ACTIVE' || state === 'ANALYZING';
}

/**
 * Custom error for invalid state transitions
 */
export class InvalidStateTransitionError extends Error {
  constructor(
    message: string,
    readonly from: TripState,
    readonly event: TripEvent,
    readonly validTransitions: TripEvent[]
  ) {
    super(message);
    this.name = 'InvalidStateTransitionError';
  }

  get suggestion(): string {
    if (this.validTransitions.length === 0) {
      return `State ${this.from} has no valid transitions.`;
    }
    return `Valid transitions from ${this.from}: ${this.validTransitions.join(', ')}`;
  }
}

/**
 * Trip State Machine class
 * Encapsulates all state management for a trip
 */
export class TripStateMachine {
  private context: TripStateContext;
  private transitionHistory: StateTransition[] = [];

  constructor(initialContext?: Partial<TripStateContext>) {
    this.context = {
      state: 'IDLE',
      createdAt: new Date(),
      catches: 0,
      spotIds: [],
      gearIds: [],
      ...initialContext,
    };
  }

  /**
   * Get current state
   */
  getState(): TripState {
    return this.context.state;
  }

  /**
   * Get full context (immutable copy)
   */
  getContext(): Readonly<TripStateContext> {
    return Object.freeze({ ...this.context });
  }

  /**
   * Get transition history
   */
  getTransitionHistory(): ReadonlyArray<StateTransition> {
    return Object.freeze([...this.transitionHistory]);
  }

  /**
   * Attempt a transition via event
   */
  dispatch(event: TripEvent, metadata?: Record<string, any>): TripState {
    const currentState = this.context.state;
    const newState = applyTransition(currentState, event);

    // Record transition
    const transition: StateTransition = {
      from: currentState,
      to: newState,
      event,
      timestamp: new Date(),
      metadata,
    };
    this.transitionHistory.push(transition);

    // Update context based on event
    this.context.state = newState;

    if (event === 'START_FISHING') {
      this.context.startedAt = new Date();
    } else if (event === 'END_FISHING') {
      this.context.endedAt = new Date();
    } else if (event === 'CANCEL') {
      this.context.cancelledAt = new Date();
    }

    return newState;
  }

  /**
   * Check if an event is valid from current state
   */
  canDispatch(event: TripEvent): boolean {
    return validateTransition(this.context.state, event);
  }

  /**
   * Get valid events from current state
   */
  getValidEvents(): TripEvent[] {
    return getValidTransitions(this.context.state);
  }

  /**
   * Add a catch record to the trip
   */
  recordCatch(): void {
    if (this.context.state !== 'ACTIVE' && this.context.state !== 'ANALYZING') {
      throw new Error(`Cannot record catch in ${this.context.state} state`);
    }
    this.context.catches++;
  }

  /**
   * Update context metadata (gear, spots, notes)
   */
  updateContext(updates: Partial<Omit<TripStateContext, 'state' | 'createdAt'>>): void {
    this.context = {
      ...this.context,
      ...updates,
    };
  }

  /**
   * Get duration of trip (start to end)
   */
  getDuration(): number | null {
    if (!this.context.startedAt || !this.context.endedAt) {
      return null;
    }
    return this.context.endedAt.getTime() - this.context.startedAt.getTime();
  }

  /**
   * Check if trip is completed
   */
  isCompleted(): boolean {
    return this.context.state === 'COMPLETED' || this.context.state === 'CANCELLED';
  }

  /**
   * Check if trip is active (currently fishing)
   */
  isActive(): boolean {
    return this.context.state === 'ACTIVE';
  }

  /**
   * Reset machine to initial state (for testing or unfinished trips)
   */
  reset(): void {
    this.context = {
      state: 'IDLE',
      createdAt: new Date(),
      catches: 0,
      spotIds: [],
      gearIds: [],
    };
    this.transitionHistory = [];
  }

  /**
   * Serialize state machine to JSON
   */
  toJSON(): {
    context: TripStateContext;
    history: StateTransition[];
  } {
    return {
      context: this.context,
      history: this.transitionHistory,
    };
  }

  /**
   * Deserialize state machine from JSON
   */
  static fromJSON(data: {
    context: TripStateContext;
    history?: StateTransition[];
  }): TripStateMachine {
    const machine = new TripStateMachine(data.context);
    if (data.history) {
      machine.transitionHistory = [...data.history];
    }
    return machine;
  }
}

/**
 * Utility to render state machine as ASCII diagram
 * Useful for documentation and debugging
 */
export function renderStateMachineDiagram(): string {
  return `
Trip State Machine Diagram:

┌─────────────────────────────────────────────────────────────┐
│ IDLE                                                        │
│ • Initial state                                             │
│ • Can start planning or skip to completed                   │
└────────────┬──────────────────────────────────────────────┬─┘
             │ START_PLANNING              │ QUICK_COMPLETE
             │ (user ready to plan)        │ (skip unused)
             ▼                             ▼
    ┌────────────────┐         ┌─────────────────────┐
    │ PLANNING       │◄────────┤ COMPLETED           │
    │ • Select date  │ CANCEL  │ • Trip archived     │
    │ • Pick location│ (anytime)│ • Final stats ready │
    │ • Choose target│         │                     │
    └────────┬───────┘         └─────────────────────┘
             │
             │ CONFIRM_PLAN
             │ (plan finalized)
             ▼
    ┌────────────────────────┐
    │ PREPARING              │◄──────────┐
    │ • Select gear          │ BACK_TO   │ (recheck plan)
    │ • Mark favorite spots  │ PLANNING  │
    │ • Review weather       │           │
    └────────┬───────────────┘           │
             │                           │
             │ START_FISHING              │
             │ (heading to water)         │
             ▼                            │
    ┌────────────────────────┐           │
    │ ACTIVE                 │ CANCEL───→┘
    │ • Fishing in progress  │ (anytime)
    │ • Logging catches      │
    │ • Real-time coach      │
    └────────┬───────────────┘
             │
             │ END_FISHING
             │ (fishing done)
             ▼
    ┌────────────────────────┐
    │ ANALYZING              │
    │ • Review session       │
    │ • Final stats          │
    │ • Can reopen for catch │
    └────────┬───────────────┘
             │
             │ FINALIZE
             │ (confirm completion)
             ▼
        [COMPLETED]
        Terminal state

Cancel is always available from any state → CANCELLED (terminal)
  `;
}
