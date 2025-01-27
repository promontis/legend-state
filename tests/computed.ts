import { endBatch } from 'src/batching';
import { computed } from '../src/computed';
import { observable } from '../src/observable';
import { Change, ObservableReadable, TrackingType } from '../src/observableInterfaces';

function promiseTimeout(time?: number) {
    return new Promise((resolve) => setTimeout(resolve, time || 0));
}

let spiedConsole: jest.SpyInstance;

beforeAll(() => {
    // eslint-disable-next-line @typescript-eslint/no-empty-function
    spiedConsole = jest.spyOn(global.console, 'error').mockImplementation(() => {});
});
afterAll(() => {
    spiedConsole.mockRestore();
});

function expectChangeHandler<T>(obs: ObservableReadable<T>, track?: TrackingType) {
    const ret = jest.fn();

    function handler({ value, getPrevious, changes }: { value: any; getPrevious: () => any; changes: Change[] }) {
        const prev = getPrevious();

        ret(value, prev, changes);
    }

    obs.onChange(handler, { trackingType: track });

    return ret;
}

describe('Computed', () => {
    test('Basic computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
    });
    test('Multiple computed changes', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
        expect(comp.get()).toEqual(30);
        const handler = expectChangeHandler(comp);
        obs.test.set(5);
        expect(handler).toHaveBeenCalledWith(25, 30, [{ path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 }]);
        expect(comp.get()).toEqual(25);
        obs.test.set(1);
        expect(handler).toHaveBeenCalledWith(21, 25, [{ path: [], pathTypes: [], valueAtPath: 21, prevAtPath: 25 }]);
        expect(comp.get()).toEqual(21);
    });
    test('Cannot directly set a computed', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => obs.test.get() + obs.test2.get());
        expect(() => {
            // @ts-expect-error Expect this to throw an error
            comp.set(40);
        }).toThrowError();
        expect(() => {
            // @ts-expect-error Expect this to throw an error
            comp.assign({ text: 'hi' });
        }).toThrowError();
        expect(() => {
            // @ts-expect-error Expect this to throw an error
            comp.delete();
        }).toThrowError();

        // This failing test would put batch in a bad state until timeout,
        // so clear it out manually
        endBatch();
    });
    test('Computed object is observable', () => {
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => ({ value: obs.test.get() + obs.test2.get() }));

        expect(comp.get()).toEqual({ value: 30 });
        expect(comp.value.get()).toEqual(30);
        const handler = expectChangeHandler(comp.value);

        obs.test.set(5);

        expect(handler).toHaveBeenCalledWith(25, 30, [{ path: [], pathTypes: [], valueAtPath: 25, prevAtPath: 30 }]);
    });
    test('Computed is lazy', () => {
        const fn = jest.fn();
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => {
            fn();
            return { v: obs.test.get() + obs.test2.get() };
        });
        expect(fn).not.toHaveBeenCalled();
        comp.get();
        expect(fn).toHaveBeenCalled();
    });
    test('Computed is lazy, activates on child get', () => {
        const fn = jest.fn();
        const obs = observable({ test: 10, test2: 20 });
        const comp = computed(() => {
            fn();
            return { v: obs.test.get() + obs.test2.get() };
        });
        expect(fn).not.toHaveBeenCalled();
        comp.v.get();
        expect(fn).toHaveBeenCalled();
    });
    test('Computed with promise', async () => {
        const obs = observable(new Promise<string>((resolve) => setTimeout(() => resolve('hi'), 0)));
        const comp = computed(() => {
            const value = obs.get();
            if (value) {
                return new Promise((resolve) => {
                    setTimeout(() => resolve('hi there'), 0);
                });
            }
        });
        expect(comp.get()).toEqual(undefined);
        await promiseTimeout(10);
        expect(comp.get()).toEqual('hi there');
    });
});
describe('Two way Computed', () => {
    test('Bound to two, get', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => obs.test.set(value) && obs.test2.set(value)
        );
        expect(comp.get()).toEqual(false);
        obs.test.set(true);
        expect(comp.get()).toEqual(false);
        obs.test2.set(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set', () => {
        const obs = observable({ test: false, test2: false });
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => obs.test.set(value) && obs.test2.set(value)
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs.test.get()).toEqual(true);
        expect(obs.test2.get()).toEqual(true);
    });
    test('Bound to array, set', () => {
        const obs = observable([false, false, false, false, false]);
        const comp = computed(
            () => obs.every((val) => val.get()),
            (value) => obs.forEach((child) => child.set(value))
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        expect(obs[0].get()).toEqual(true);
        expect(comp.get()).toEqual(true);
    });
    test('Bound to two, set, handler', () => {
        const obs = observable({ test: false, test2: false });
        const handler = expectChangeHandler(obs);
        const comp = computed(
            () => obs.test.get() && obs.test2.get(),
            (value) => obs.test.set(value) && obs.test2.set(value)
        );
        expect(comp.get()).toEqual(false);
        comp.set(true);
        // TODO: This previous value is wrong, fix and write a test for previous to make sure
        // it is the previous value before all changes in the current batch
        expect(handler).toHaveBeenCalledWith({ test: true, test2: true }, { test: false, test2: true }, [
            {
                path: ['test'],
                pathTypes: ['object'],
                prevAtPath: false,
                valueAtPath: true,
            },
            {
                path: ['test2'],
                pathTypes: ['object'],
                prevAtPath: false,
                valueAtPath: true,
            },
        ]);
        expect(handler).toHaveBeenCalledTimes(1);

        expect(comp.get()).toEqual(true);
    });
});
