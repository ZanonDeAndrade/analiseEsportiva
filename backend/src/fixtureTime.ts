import type { FixtureRecord } from './schemas.js'

export function upcomingFixtures(fixtures: FixtureRecord[], now = new Date()): FixtureRecord[] {
  return fixtures
    .filter((fixture) => isUpcomingFixture(fixture, now))
    .sort((left, right) => left.isoDate.localeCompare(right.isoDate))
}

export function isUpcomingFixture(fixture: FixtureRecord, now = new Date()): boolean {
  const kickoff = new Date(fixture.isoDate)
  if (Number.isNaN(kickoff.getTime())) return false
  return kickoff.getTime() > now.getTime()
}
