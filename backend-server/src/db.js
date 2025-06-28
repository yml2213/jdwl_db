import { Low } from 'lowdb'
import { JSONFile } from 'lowdb/node'
import path from 'path'
import { fileURLToPath } from 'url'
import { v4 as uuidv4 } from 'uuid'

// ES Module equivalent of __dirname
const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Construct the absolute path to db.json, located in the parent directory (backend-server)
const file = path.join(__dirname, '..', 'db.json')

// Configure lowdb to use JSONFile adapter
const adapter = new JSONFile(file)
const defaultData = { sessions: [] }
const db = new Low(adapter, defaultData)

// Read data from db.json
await db.read()

/**
 * Finds a session by its unique key (pin + deptId)
 * @param {string} uniqueKey - The unique key for the session.
 * @returns {object | undefined} The session object or undefined if not found.
 */
function findSessionByUniqueKey(uniqueKey) {
    return db.data.sessions.find(s => s.uniqueKey === uniqueKey)
}

/**
 * Creates or updates a session.
 * If a session with the same uniqueKey exists, it updates it. Otherwise, it creates a new one.
 * @param {object} data - The session data including uniqueKey, cookies, etc.
 * @returns {string} The sessionId of the created or updated session.
 */
export async function createOrUpdateSession(data) {
    const { uniqueKey } = data
    let session = findSessionByUniqueKey(uniqueKey)

    if (session) {
        // Update existing session
        console.log(`[DB] Updating existing session for uniqueKey: ${uniqueKey}`)
        session.data = { ...session.data, ...data }
        session.updatedAt = new Date().toISOString()
    } else {
        // Create new session
        console.log(`[DB] Creating new session for uniqueKey: ${uniqueKey}`)
        session = {
            sessionId: uuidv4(),
            uniqueKey,
            data,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
        }
        db.data.sessions.push(session)
    }

    await db.write()
    return session.sessionId
}


/**
 * Retrieves a session by its ID.
 * @param {string} sessionId - The UUID of the session.
 * @returns {object | undefined} The session object or undefined.
 */
export async function getSession(sessionId) {
    // Ensure data is read before trying to access it
    await db.read()
    const session = db.data.sessions.find(s => s.sessionId === sessionId)
    if (!session) {
        console.warn(`[DB] Session not found for ID: ${sessionId}`)
        return undefined
    }
    return session
} 