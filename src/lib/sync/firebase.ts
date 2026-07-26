"use client";

import { db, getSettings } from "@/lib/db";
import type { Exam, FirebaseConfig, Pool, Question, TaskType } from "@/types";

/**
 * Optionale Geräte-Synchronisierung über Firestore.
 *
 * Bewusst als Zusatz gebaut, nicht als Fundament: Die App arbeitet immer
 * zuerst gegen IndexedDB. Ist keine Firebase-Konfiguration hinterlegt,
 * wird das SDK nie geladen und nie ein Byte verschickt. Zusammengeführt
 * wird per "wer zuletzt geschrieben hat, gewinnt" anhand von updatedAt —
 * für einen Einzelnutzer mit mehreren Geräten reicht das.
 */

const COLLECTION = "users";

/** Firestore erlaubt 500 Operationen je Batch. */
const BATCH_LIMIT = 450;

export function configFromEnv(): FirebaseConfig | null {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!apiKey || !projectId) return null;

  return {
    apiKey,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? `${projectId}.firebaseapp.com`,
    projectId,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "",
  };
}

export async function resolveConfig(): Promise<FirebaseConfig | null> {
  const settings = await getSettings();
  if (!settings.syncEnabled) return null;
  return settings.firebase ?? configFromEnv();
}

async function getFirebase(config: FirebaseConfig) {
  const [{ initializeApp, getApps, getApp }, auth, firestore] = await Promise.all([
    import("firebase/app"),
    import("firebase/auth"),
    import("firebase/firestore"),
  ]);

  const app = getApps().length ? getApp() : initializeApp(config);

  // Der lokale Cache lässt Firestore auch ohne Netz antworten; die App
  // liest zwar ohnehin aus Dexie, aber so scheitert ein Sync-Versuch im
  // Offline-Fall leise statt mit einem Fehler.
  let store;
  try {
    store = firestore.initializeFirestore(app, {
      localCache: firestore.persistentLocalCache({
        tabManager: firestore.persistentMultipleTabManager(),
      }),
    });
  } catch {
    // Wurde Firestore in dieser Sitzung schon initialisiert.
    store = firestore.getFirestore(app);
  }

  return { app, auth, firestore, store };
}

export interface SyncAccount {
  uid: string;
  email: string | null;
  displayName: string | null;
}

export async function signIn(): Promise<SyncAccount> {
  const config = await resolveConfig();
  if (!config) throw new Error("Keine Firebase-Konfiguration hinterlegt.");

  const { auth } = await getFirebase(config);
  const instance = auth.getAuth();
  const provider = new auth.GoogleAuthProvider();
  const credential = await auth.signInWithPopup(instance, provider);

  return {
    uid: credential.user.uid,
    email: credential.user.email,
    displayName: credential.user.displayName,
  };
}

export async function signOut(): Promise<void> {
  const config = await resolveConfig();
  if (!config) return;
  const { auth } = await getFirebase(config);
  await auth.signOut(auth.getAuth());
}

export async function currentAccount(): Promise<SyncAccount | null> {
  const config = await resolveConfig();
  if (!config) return null;

  const { auth } = await getFirebase(config);
  const instance = auth.getAuth();

  const user = await new Promise<import("firebase/auth").User | null>((resolve) => {
    const unsubscribe = auth.onAuthStateChanged(instance, (value) => {
      unsubscribe();
      resolve(value);
    });
  });

  if (!user) return null;
  return { uid: user.uid, email: user.email, displayName: user.displayName };
}

export interface SyncReport {
  pushed: { pools: number; taskTypes: number; questions: number; exams: number };
  pulled: { pools: number; taskTypes: number; questions: number; exams: number };
}

interface Timestamped {
  id: string;
  updatedAt?: string;
  createdAt?: string;
}

function stamp(record: Timestamped): number {
  return Date.parse(record.updatedAt ?? record.createdAt ?? "") || 0;
}

/**
 * Ein vollständiger Abgleich in beide Richtungen. Bei jedem Datensatz
 * gewinnt die neuere Fassung.
 */
export async function syncNow(): Promise<SyncReport> {
  const config = await resolveConfig();
  if (!config) throw new Error("Synchronisierung ist nicht aktiviert.");

  const { auth, firestore, store } = await getFirebase(config);
  const user = auth.getAuth().currentUser;
  if (!user) throw new Error("Nicht angemeldet — bitte zuerst mit Google anmelden.");

  const report: SyncReport = {
    pushed: { pools: 0, taskTypes: 0, questions: 0, exams: 0 },
    pulled: { pools: 0, taskTypes: 0, questions: 0, exams: 0 },
  };

  const root = firestore.doc(store, COLLECTION, user.uid);

  const tables = [
    { name: "pools" as const, table: db.pools },
    { name: "taskTypes" as const, table: db.taskTypes },
    { name: "questions" as const, table: db.questions },
    { name: "exams" as const, table: db.exams },
  ];

  const deletedIds = new Set(
    (await db.tombstones.toArray()).map((tombstone) => tombstone.id)
  );

  for (const { name, table } of tables) {
    const collection = firestore.collection(root, name);
    const remoteSnapshot = await firestore.getDocs(collection);

    const remote = new Map<string, Timestamped>();
    remoteSnapshot.forEach((docSnapshot) => {
      remote.set(docSnapshot.id, docSnapshot.data() as Timestamped);
    });

    const local = (await table.toArray()) as unknown as Timestamped[];
    const localById = new Map(local.map((record) => [record.id, record]));

    // Hochladen, was lokal neuer ist.
    const toPush = local.filter((record) => {
      const counterpart = remote.get(record.id);
      return !counterpart || stamp(record) > stamp(counterpart);
    });

    for (let i = 0; i < toPush.length; i += BATCH_LIMIT) {
      const batch = firestore.writeBatch(store);
      for (const record of toPush.slice(i, i + BATCH_LIMIT)) {
        batch.set(firestore.doc(collection, record.id), record);
      }
      await batch.commit();
    }
    report.pushed[name] = toPush.length;

    // Herunterladen, was entfernt neuer ist — außer es wurde hier gelöscht.
    const toPull: Timestamped[] = [];
    const toDeleteRemotely: string[] = [];

    for (const [id, record] of remote) {
      if (deletedIds.has(`${name}:${id}`)) {
        toDeleteRemotely.push(id);
        continue;
      }
      const counterpart = localById.get(id);
      if (!counterpart || stamp(record) > stamp(counterpart)) toPull.push(record);
    }

    if (toPull.length > 0) {
      await (table as unknown as {
        bulkPut: (items: unknown[]) => Promise<unknown>;
      }).bulkPut(toPull as unknown as (Pool | TaskType | Question | Exam)[]);
    }
    report.pulled[name] = toPull.length;

    for (let i = 0; i < toDeleteRemotely.length; i += BATCH_LIMIT) {
      const batch = firestore.writeBatch(store);
      for (const id of toDeleteRemotely.slice(i, i + BATCH_LIMIT)) {
        batch.delete(firestore.doc(collection, id));
      }
      await batch.commit();
    }
  }

  return report;
}

/**
 * Firestore-Regeln, die zu diesem Datenlayout passen. Wird in den
 * Einstellungen zum Kopieren angezeigt.
 */
export const FIRESTORE_RULES = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{userId}/{document=**} {
      allow read, write: if request.auth != null && request.auth.uid == userId;
    }
  }
}`;
