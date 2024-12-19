/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { LexiconDoc, Lexicons } from '@atproto/lexicon'

export const schemaDict = {
  ComPlaymintDevSpaceshooterStats: {
    lexicon: 1,
    id: 'com.playmint.dev.spaceshooter.stats',
    defs: {
      main: {
        type: 'record',
        key: 'literal:self',
        record: {
          type: 'object',
          required: [
            'totalWins',
            'totalGames',
            'totalKills',
            'totalDeaths',
            'highestScore',
          ],
          properties: {
            totalWins: {
              type: 'integer',
            },
            totalGames: {
              type: 'integer',
            },
            totalKills: {
              type: 'integer',
            },
            totalDeaths: {
              type: 'integer',
            },
            highestScore: {
              type: 'integer',
            },
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>

export const schemas = Object.values(schemaDict)
export const lexicons: Lexicons = new Lexicons(schemas)
export const ids = {
  ComPlaymintDevSpaceshooterStats: 'com.playmint.dev.spaceshooter.stats',
}
