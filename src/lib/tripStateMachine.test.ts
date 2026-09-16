import { describe, it, expect, beforeEach } from 'vitest';
import {
  TripStateMachine,
  validateTransition,
  applyTransition,
  getValidTransitions,
  getIncomingStates,
  isTerminalState,
  isActiveTripState,
  InvalidStateTransitionError,
  type TripState,
} from './tripStateMachine';

describe('Trip State Machine', () => {
  let machine: TripStateMachine;

  beforeEach(() => {
    machine = new TripStateMachine();
  });

  describe('Initialization', () => {
    it('should start in IDLE state', () => {
      expect(machine.getState()).toBe('IDLE');
    });

    it('should have empty catches on init', () => {
      expect(machine.getContext().catches).toBe(0);
    });

    it('should have creation timestamp', () => {
      const context = machine.getContext();
      expect(context.createdAt).toBeInstanceOf(Date);
    });

    it('should allow custom initial context', () => {
      const customMachine = new TripStateMachine({
        spotIds: ['spot1', 'spot2'],
        gearIds: ['rod1', 'reel1'],
      });
      expect(customMachine.getContext().spotIds).toEqual(['spot1', 'spot2']);
      expect(customMachine.getContext().gearIds).toEqual(['rod1', 'reel1']);
    });
  });

  describe('Valid State Transitions', () => {
    it('should transition from IDLE to PLANNING', () => {
      expect(machine.canDispatch('START_PLANNING')).toBe(true);
      const newState = machine.dispatch('START_PLANNING');
      expect(newState).toBe('PLANNING');
      expect(machine.getState()).toBe('PLANNING');
    });

    it('should transition through happy path', () => {
      expect(machine.getState()).toBe('IDLE');

      machine.dispatch('START_PLANNING');
      expect(machine.getState()).toBe('PLANNING');

      machine.dispatch('CONFIRM_PLAN');
      expect(machine.getState()).toBe('PREPARING');

      machine.dispatch('START_FISHING');
      expect(machine.getState()).toBe('ACTIVE');

      machine.dispatch('END_FISHING');
      expect(machine.getState()).toBe('ANALYZING');

      machine.dispatch('FINALIZE');
      expect(machine.getState()).toBe('COMPLETED');
    });

    it('should allow QUICK_COMPLETE from IDLE', () => {
      expect(machine.canDispatch('QUICK_COMPLETE')).toBe(true);
      machine.dispatch('QUICK_COMPLETE');
      expect(machine.getState()).toBe('COMPLETED');
    });

    it('should allow BACK_TO_PLANNING from PREPARING', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      expect(machine.getState()).toBe('PREPARING');

      machine.dispatch('BACK_TO_PLANNING');
      expect(machine.getState()).toBe('PLANNING');
    });

    it('should allow BACK_TO_PREP from ANALYZING', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');
      machine.dispatch('END_FISHING');
      expect(machine.getState()).toBe('ANALYZING');

      machine.dispatch('BACK_TO_PREP');
      expect(machine.getState()).toBe('ACTIVE');
    });
  });

  describe('Invalid Transitions', () => {
    it('should reject direct transition from IDLE to ACTIVE', () => {
      expect(() => machine.dispatch('START_FISHING')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should reject transition from PLANNING to ACTIVE', () => {
      machine.dispatch('START_PLANNING');
      expect(() => machine.dispatch('START_FISHING')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should reject transition from ACTIVE to PLANNING', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      expect(() => machine.dispatch('START_PLANNING')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('should reject transitions from CANCELLED state', () => {
      machine.dispatch('CANCEL');
      expect(machine.isCompleted()).toBe(true);

      expect(() => machine.dispatch('START_PLANNING')).toThrow(
        InvalidStateTransitionError
      );
    });
  });

  describe('Cancel Event', () => {
    it('should allow cancel from any state', () => {
      const states: TripState[] = ['IDLE', 'PLANNING', 'PREPARING', 'ACTIVE', 'ANALYZING', 'COMPLETED'];

      states.forEach(state => {
        const m = new TripStateMachine();
        // Navigate to desired state
        if (state !== 'IDLE') {
          m.dispatch('START_PLANNING');
          if (state !== 'PLANNING') {
            m.dispatch('CONFIRM_PLAN');
            if (state !== 'PREPARING') {
              m.dispatch('START_FISHING');
              if (state !== 'ACTIVE') {
                m.dispatch('END_FISHING');
                if (state !== 'ANALYZING') {
                  m.dispatch('FINALIZE');
                }
              }
            }
          }
        }

        expect(m.canDispatch('CANCEL')).toBe(true);
        m.dispatch('CANCEL');
        expect(m.getState()).toBe('CANCELLED');
      });
    });

    it('should set cancelledAt timestamp', () => {
      machine.dispatch('CANCEL');
      expect(machine.getContext().cancelledAt).toBeInstanceOf(Date);
    });
  });

  describe('Validation Functions', () => {
    it('validateTransition should work correctly', () => {
      expect(validateTransition('IDLE', 'START_PLANNING')).toBe(true);
      expect(validateTransition('IDLE', 'START_FISHING')).toBe(false);
      expect(validateTransition('PLANNING', 'CONFIRM_PLAN')).toBe(true);
      expect(validateTransition('PLANNING', 'FINALIZE')).toBe(false);
    });

    it('applyTransition should return correct target state', () => {
      const state = applyTransition('IDLE', 'START_PLANNING');
      expect(state).toBe('PLANNING');
    });

    it('applyTransition should throw for invalid transitions', () => {
      expect(() => applyTransition('IDLE', 'START_FISHING')).toThrow(
        InvalidStateTransitionError
      );
    });

    it('getValidTransitions should list all valid events', () => {
      const transitions = getValidTransitions('IDLE');
      expect(transitions).toContain('START_PLANNING');
      expect(transitions).toContain('QUICK_COMPLETE');
      expect(transitions).toContain('CANCEL');
    });

    it('getIncomingStates should find all states leading to target', () => {
      const incoming = getIncomingStates('COMPLETED');
      expect(incoming).toContain('ANALYZING');
      expect(incoming).toContain('IDLE');
    });

    it('isTerminalState should identify CANCELLED', () => {
      expect(isTerminalState('CANCELLED')).toBe(true);
      expect(isTerminalState('COMPLETED')).toBe(false); // Can still cancel completed
      expect(isTerminalState('ACTIVE')).toBe(false);
    });

    it('isActiveTripState should identify active states', () => {
      expect(isActiveTripState('IDLE')).toBe(true);
      expect(isActiveTripState('PLANNING')).toBe(true);
      expect(isActiveTripState('ACTIVE')).toBe(true);
      expect(isActiveTripState('COMPLETED')).toBe(false);
      expect(isActiveTripState('CANCELLED')).toBe(false);
    });
  });

  describe('Catch Recording', () => {
    it('should record catch in ACTIVE state', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      machine.recordCatch();
      expect(machine.getContext().catches).toBe(1);

      machine.recordCatch();
      expect(machine.getContext().catches).toBe(2);
    });

    it('should record catch in ANALYZING state', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');
      machine.dispatch('END_FISHING');

      machine.recordCatch();
      expect(machine.getContext().catches).toBe(1);
    });

    it('should reject catch recording in IDLE state', () => {
      expect(() => machine.recordCatch()).toThrow();
    });

    it('should reject catch recording in PLANNING state', () => {
      machine.dispatch('START_PLANNING');
      expect(() => machine.recordCatch()).toThrow();
    });

    it('should reject catch recording in COMPLETED state', () => {
      machine.dispatch('QUICK_COMPLETE');
      expect(() => machine.recordCatch()).toThrow();
    });
  });

  describe('Context Updates', () => {
    it('should update context metadata', () => {
      machine.updateContext({
        spotIds: ['spot1', 'spot2'],
        gearIds: ['rod1'],
        notes: 'Great day on the water',
      });

      const context = machine.getContext();
      expect(context.spotIds).toEqual(['spot1', 'spot2']);
      expect(context.gearIds).toEqual(['rod1']);
      expect(context.notes).toBe('Great day on the water');
    });

    it('should preserve state when updating context', () => {
      machine.dispatch('START_PLANNING');
      machine.updateContext({ spotIds: ['spot1'] });
      expect(machine.getState()).toBe('PLANNING');
    });
  });

  describe('Timing', () => {
    it('should set startedAt on START_FISHING', () => {
      expect(machine.getContext().startedAt).toBeUndefined();

      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      expect(machine.getContext().startedAt).toBeInstanceOf(Date);
    });

    it('should set endedAt on END_FISHING', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      expect(machine.getContext().endedAt).toBeUndefined();

      machine.dispatch('END_FISHING');
      expect(machine.getContext().endedAt).toBeInstanceOf(Date);
    });

    it('should calculate duration correctly', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      const before = machine.getContext().startedAt!.getTime();

      machine.dispatch('END_FISHING');
      const duration = machine.getDuration();

      expect(duration).not.toBeNull();
      expect(duration!).toBeGreaterThanOrEqual(0);
    });

    it('should return null duration before fishing', () => {
      expect(machine.getDuration()).toBeNull();

      machine.dispatch('START_PLANNING');
      expect(machine.getDuration()).toBeNull();
    });
  });

  describe('State Checks', () => {
    it('isCompleted should identify completed/cancelled states', () => {
      expect(machine.isCompleted()).toBe(false);

      machine.dispatch('QUICK_COMPLETE');
      expect(machine.isCompleted()).toBe(true);
    });

    it('isActive should identify ACTIVE state', () => {
      expect(machine.isActive()).toBe(false);

      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');
      expect(machine.isActive()).toBe(true);

      machine.dispatch('END_FISHING');
      expect(machine.isActive()).toBe(false);
    });
  });

  describe('Transition History', () => {
    it('should record transition history', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');

      const history = machine.getTransitionHistory();
      expect(history.length).toBe(2);
      expect(history[0].event).toBe('START_PLANNING');
      expect(history[1].event).toBe('CONFIRM_PLAN');
    });

    it('should include timestamps in history', () => {
      machine.dispatch('START_PLANNING');
      const history = machine.getTransitionHistory();
      expect(history[0].timestamp).toBeInstanceOf(Date);
    });

    it('should include metadata in transitions', () => {
      machine.dispatch('START_PLANNING', { reason: 'test' });
      const history = machine.getTransitionHistory();
      expect(history[0].metadata).toEqual({ reason: 'test' });
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');
      machine.recordCatch();

      const json = machine.toJSON();
      expect(json.context.state).toBe('ACTIVE');
      expect(json.context.catches).toBe(1);
      expect(json.history.length).toBe(3);
    });

    it('should deserialize from JSON', () => {
      machine.dispatch('START_PLANNING');
      machine.updateContext({ spotIds: ['spot1'] });

      const json = machine.toJSON();
      const restored = TripStateMachine.fromJSON(json);

      expect(restored.getState()).toBe('PLANNING');
      expect(restored.getContext().spotIds).toEqual(['spot1']);
      expect(restored.getTransitionHistory().length).toBe(1);
    });

    it('should restore full state including history', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');
      machine.dispatch('START_FISHING');

      const json = machine.toJSON();
      const restored = TripStateMachine.fromJSON(json);

      expect(restored.getTransitionHistory().length).toBe(3);
    });
  });

  describe('Reset', () => {
    it('should reset to initial state', () => {
      machine.dispatch('START_PLANNING');
      machine.dispatch('CONFIRM_PLAN');

      machine.reset();

      expect(machine.getState()).toBe('IDLE');
      expect(machine.getContext().catches).toBe(0);
      expect(machine.getTransitionHistory().length).toBe(0);
    });
  });

  describe('Error Messages', () => {
    it('should provide helpful error messages', () => {
      try {
        machine.dispatch('START_FISHING');
      } catch (e) {
        if (e instanceof InvalidStateTransitionError) {
          expect(e.message).toContain('Cannot transition from IDLE');
          expect(e.suggestion).toContain('Valid transitions');
        }
      }
    });

    it('should include valid transitions in error', () => {
      try {
        machine.dispatch('FINALIZE');
      } catch (e) {
        if (e instanceof InvalidStateTransitionError) {
          expect(e.validTransitions).toContain('START_PLANNING');
          expect(e.validTransitions).toContain('CANCEL');
        }
      }
    });
  });
});
