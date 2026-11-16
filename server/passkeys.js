// Passkey (WebAuthn) ceremonies. Passkeys are bound to the server's address, so they need ORIGIN
// set to exactly what people type (https://thally.example.com, or http://localhost:5173 in dev).
// Without ORIGIN they are off and the app shows password sign-in only.
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server'
import { HttpError } from './http.js'

const CHALLENGE_MINUTES = 5

export function createPasskeys({ origin, rpName = 'Thally' }) {
  if (!origin) return null
  const rpID = new URL(origin).hostname
  // challenge -> { purpose, data, expires }; one use each.
  const pending = new Map()

  function remember(challenge, purpose, data) {
    const now = Date.now()
    for (const [k, p] of pending) if (p.expires < now) pending.delete(k)
    pending.set(challenge, { purpose, data, expires: now + CHALLENGE_MINUTES * 60_000 })
  }
  function take(response, purpose) {
    let challenge
    try {
      challenge = JSON.parse(Buffer.from(response?.response?.clientDataJSON, 'base64url').toString()).challenge
    } catch {
      throw new HttpError(400, 'Not a passkey response')
    }
    const p = pending.get(challenge)
    pending.delete(challenge)
    if (!p || p.purpose !== purpose || p.expires < Date.now()) throw new HttpError(400, 'That passkey prompt has expired. Try again.')
    return { challenge, data: p.data }
  }

  return {
    rpID,

    /** Options to create a passkey. `data` comes back from verifyRegistration. */
    async registrationOptions({ userId, name, exclude = [], purpose, data }) {
      const options = await generateRegistrationOptions({
        rpName,
        rpID,
        userName: name,
        userID: new TextEncoder().encode(userId),
        attestationType: 'none',
        excludeCredentials: exclude.map((p) => ({ id: p.id, transports: p.transports })),
        authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
      })
      remember(options.challenge, purpose, data)
      return options
    },

    /** Returns { credential, data } where credential is what gets stored with the account. */
    async verifyRegistration(response, purpose) {
      const { challenge, data } = take(response, purpose)
      let result
      try {
        result = await verifyRegistrationResponse({ response, expectedChallenge: challenge, expectedOrigin: origin, expectedRPID: rpID })
      } catch {
        throw new HttpError(400, 'The passkey could not be verified')
      }
      if (!result.verified) throw new HttpError(400, 'The passkey could not be verified')
      const c = result.registrationInfo.credential
      return {
        data,
        credential: {
          id: c.id,
          publicKey: Buffer.from(c.publicKey).toString('base64url'),
          counter: c.counter,
          transports: c.transports || [],
          backedUp: result.registrationInfo.credentialBackedUp,
          created: new Date().toISOString(),
        },
      }
    },

    /** Options to sign in. With `allow`, only those credentials (proving it is you); else any. */
    async authenticationOptions({ purpose, data, allow }) {
      const options = await generateAuthenticationOptions({
        rpID,
        userVerification: 'preferred',
        allowCredentials: allow?.map((p) => ({ id: p.id, transports: p.transports })),
      })
      remember(options.challenge, purpose, data)
      return options
    },

    /** `find(credentialId)` -> { uid, passkey } of the stored credential. Returns { uid, newCounter, data }. */
    async verifyAuthentication(response, purpose, find) {
      const { challenge, data } = take(response, purpose)
      const { uid, passkey } = find(response.id) || {}
      if (!passkey) throw new HttpError(401, 'This passkey is not registered here')
      let result
      try {
        result = await verifyAuthenticationResponse({
          response,
          expectedChallenge: challenge,
          expectedOrigin: origin,
          expectedRPID: rpID,
          credential: { id: passkey.id, publicKey: Buffer.from(passkey.publicKey, 'base64url'), counter: passkey.counter, transports: passkey.transports },
        })
      } catch {
        throw new HttpError(401, 'The passkey could not be verified')
      }
      if (!result.verified) throw new HttpError(401, 'The passkey could not be verified')
      return { uid, newCounter: result.authenticationInfo.newCounter, data }
    },
  }
}
