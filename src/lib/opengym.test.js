import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import test from 'node:test'
import {
  convertOpenGymMeasurements,
  convertOpenGymWeights,
  convertOpenGymWorkouts,
  estimateWorkoutCalories,
  normalizeServerUrl,
  parseOpenGymCsv,
  redeemPairingCode,
  syncRemoteOpenGym,
} from './opengym.js'

test('estimateWorkoutCalories calculates MET-based calories burned', () => {
  // 60 minutes resistance training (MET 5.5) for 70kg person:
  // (60 * 5.5 * 3.5 * 70) / 200 = 404.25 -> 404
  const cals = estimateWorkoutCalories(60, 70, false)
  assert.equal(cals, 404)

  // 45 minutes cardio (MET 7.5) for 80kg person:
  // (45 * 7.5 * 3.5 * 80) / 200 = 472.5 -> 473
  const cardioCals = estimateWorkoutCalories(45, 80, true)
  assert.equal(cardioCals, 473)
})

test('convertOpenGymWorkouts converts openGym workouts array', () => {
  const workouts = [
    {
      id: 'w123',
      d: '2026-11-15',
      name: 'Push Day',
      start: 1731664800000,
      end: 1731668400000, // 60 mins
      entries: [
        { name: 'Bench Press', sets: [{ w: 80, r: 8 }, { w: 80, r: 8 }] },
        { name: 'Overhead Press', sets: [{ w: 50, r: 8 }] },
      ],
    },
  ]

  const converted = convertOpenGymWorkouts(workouts, 70)
  assert.ok(converted['2026-11-15'])
  assert.equal(converted['2026-11-15'].length, 1)

  const item = converted['2026-11-15'][0]
  assert.equal(item.name, 'Push Day')
  assert.equal(item.durationMin, 60)
  assert.equal(item.caloriesBurned, 404)
  assert.equal(item.source, 'openGym')
  assert.ok(item.details.includes('3 sets'))
  assert.ok(item.details.includes('Bench Press'))
})

test('convertOpenGymWeights converts kg and lb accurately', () => {
  const bodyweightKg = [
    { d: '2026-11-10', w: 75.4 },
    { d: '2026-11-11', w: 75.1 },
  ]
  const weightsKg = convertOpenGymWeights(bodyweightKg, 'kg')
  assert.deepEqual(weightsKg, {
    '2026-11-10': 75.4,
    '2026-11-11': 75.1,
  })

  // Testing lb conversion
  const bodyweightLb = [{ d: '2026-11-12', w: 165 }]
  const weightsLb = convertOpenGymWeights(bodyweightLb, 'lb')
  // 165 * 0.45359237 = 74.8427 -> 74.8
  assert.equal(weightsLb['2026-11-12'], 74.8)
})

test('convertOpenGymMeasurements maps body metrics', () => {
  const measurements = [
    {
      d: '2026-11-15',
      waist: 82.5,
      hips: 98,
      chest: 104,
      bicep: 38,
      bf: 15.5,
    },
  ]
  const converted = convertOpenGymMeasurements(measurements)
  assert.deepEqual(converted['2026-11-15'], {
    waist: 82.5,
    hips: 98,
    chest: 104,
    arms: 38,
    bodyFat: 15.5,
  })
})

test('parseOpenGymCsv parses workouts and body CSV files', () => {
  const workoutsCsv = `date,start_time,end_time,workout,workout_note,exercise,exercise_id,body_part,superset_id,set,set_type,side,weight,unit,reps,rpe,rir,distance_km,seconds,incline,note,set_note
2026-11-15,10:00,10:50,"Pull Day","","Pull Up","pull_up","back","1",1,"work","","0","kg",10,"","","","","","",""
2026-11-15,10:00,10:50,"Pull Day","","Barbell Row","barbell_row","back","1",2,"work","","70","kg",8,"","","","","","",""`

  const parsedWorkouts = parseOpenGymCsv(workoutsCsv)
  assert.equal(parsedWorkouts?.type, 'workouts_csv')
  assert.equal(parsedWorkouts.workouts.length, 1)
  assert.equal(parsedWorkouts.workouts[0].name, 'Pull Day')
  assert.equal(parsedWorkouts.workouts[0].entries.length, 2)

  const bodyCsv = `date,time,weight,unit,waist,hips,chest,body_fat
2026-11-15,08:30,76.2,kg,81,96,102,15.2`

  const parsedBody = parseOpenGymCsv(bodyCsv)
  assert.equal(parsedBody?.type, 'body_csv')
  assert.equal(parsedBody.bodyweight.length, 1)
  assert.equal(parsedBody.bodyweight[0].w, 76.2)
  assert.equal(parsedBody.measurements.length, 1)
  assert.equal(parsedBody.measurements[0].waist, 81)
})

test('normalizeServerUrl handles various address formats', () => {
  assert.equal(normalizeServerUrl('http://localhost:8080/'), 'http://localhost:8080')
  assert.equal(normalizeServerUrl('localhost:8080'), 'http://localhost:8080')
  assert.equal(normalizeServerUrl('https://gym.myhome.net/api/'), 'https://gym.myhome.net/api')
  assert.equal(normalizeServerUrl('   '), null)
})

test('redeemPairingCode and syncRemoteOpenGym work with mock openGym server', async () => {

  const mockOpenGymState = {
    workouts: [
      {
        id: 'w_remote_1',
        d: '2026-11-16',
        name: 'Leg Day',
        start: 1731751200000,
        end: 1731754800000,
        entries: [{ name: 'Squat', sets: [{ w: 100, r: 5 }] }],
      },
    ],
    bodyweight: [{ d: '2026-11-16', w: 74.5 }],
    measurements: [{ d: '2026-11-16', waist: 80 }],
  }

  const server = createServer((req, res) => {
    if (req.method === 'POST' && req.url === '/api/pair/redeem') {
      let body = ''
      req.on('data', (d) => (body += d))
      req.on('end', () => {
        const parsed = JSON.parse(body)
        if (parsed.code === 'ABC123') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ token: 'mock_token_xyz', user: { id: 'u1', name: 'Tester' } }))
        } else {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'invalid or expired code' }))
        }
      })
    } else if (req.method === 'GET' && req.url === '/api/data/rev') {
      if (req.headers.authorization === 'Bearer mock_token_xyz') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ rev: 'rev_99' }))
      } else {
        res.writeHead(401)
        res.end()
      }
    } else if (req.method === 'GET' && req.url === '/api/data') {
      if (req.headers.authorization === 'Bearer mock_token_xyz') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(mockOpenGymState))
      } else {
        res.writeHead(401)
        res.end()
      }
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  await new Promise((resolve) => server.listen(0, resolve))
  const port = server.address().port
  const serverUrl = `http://localhost:${port}`

  try {
    // 1. Redeem pairing code
    const paired = await redeemPairingCode(serverUrl, 'ABC123')
    assert.equal(paired.token, 'mock_token_xyz')
    assert.equal(paired.user.name, 'Tester')

    // 2. Mock store
    let remoteState = {
      connected: true,
      serverUrl,
      token: paired.token,
      user: paired.user,
      lastRev: null,
      lastSync: null,
      autoSync: true,
    }

    const mockStore = {
      weights: {},
      exercises: {},
      measurements: {},
      profile: { weightKg: 70 },
      openGymRemote: remoteState,
      setOpenGymSync: (syncObj) => {
        mockStore.weights = syncObj.weights
        mockStore.exercises = syncObj.exercises
        mockStore.measurements = syncObj.measurements
      },
      setOpenGymRemote: (patch) => {
        remoteState = { ...remoteState, ...patch }
        mockStore.openGymRemote = remoteState
      },
    }

    // 3. Sync remote openGym
    const result = await syncRemoteOpenGym(mockStore)
    assert.equal(result.success, true)
    assert.equal(result.updated, true)
    assert.equal(result.rev, 'rev_99')
    assert.equal(mockStore.weights['2026-11-16'], 74.5)
    assert.ok(mockStore.exercises['2026-11-16'])
    assert.equal(mockStore.exercises['2026-11-16'][0].name, 'Leg Day')
    assert.equal(mockStore.measurements['2026-11-16'].waist, 80)

    // 4. Second sync with same rev should report updated: false
    const secondSync = await syncRemoteOpenGym(mockStore)
    assert.equal(secondSync.success, true)
    assert.equal(secondSync.updated, false)
  } finally {
    server.close()
  }
})
