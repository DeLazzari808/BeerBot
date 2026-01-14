
/**
 * Simple Promise Queue to serialize async operations
 */
export class SerialQueue {
    private queue: Promise<void> = Promise.resolve();

    /**
     * Adds a task to the queue. Tasks are executed sequentially.
     * @param task A function that returns a promise
     */
    add<T>(task: () => Promise<T>): Promise<T> {
        return new Promise((resolve, reject) => {
            this.queue = this.queue.then(async () => {
                try {
                    const result = await task();
                    resolve(result);
                } catch (error) {
                    reject(error);
                }
            });
        });
    }
}

export const messageQueue = new SerialQueue();
