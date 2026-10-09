// OMARCHY: modified for snote from Automattic's simplenote-electron (GPLv2); see NOTICE (2026-09-23).
import type {
  BucketObject,
  BucketStore,
  EntityCallback,
  EntitiesCallback,
} from 'simperium';
import type * as T from '../../../types';

export class InMemoryBucket<U> implements BucketStore<U> {
  entities: Map<T.EntityId, U>;

  constructor() {
    this.entities = new Map();
  }

  get(id: T.EntityId, callback: EntityCallback<BucketObject<U>>) {
    callback(null, { id, data: this.entities.get(id) });
  }

  find(query: {}, callback: EntitiesCallback<BucketObject<U>>) {
    callback(
      null,
      [...this.entities].map(([id, data]) => ({ id, data }))
    );
  }

  remove(id: T.EntityId, callback: (error: null) => void) {
    this.entities.delete(id);
    callback(null);
  }

  // OMARCHY: added for Simperium client compatibility; simperium 1.1.4 calls put only on ghost stores, so this is not reached today.
  put(id: T.EntityId, version: number, data: U): Promise<{ id: T.EntityId; data: U; version: number }> {
    this.entities.set(id, data);
    return Promise.resolve({ id, data, version });
  }

  update(
    id: T.EntityId,
    data: U,
    isIndexing: boolean,
    callback: EntityCallback<BucketObject<U>>
  ) {
    this.entities.set(id, data);
    callback(null, { id, data, isIndexing });
  }
}
