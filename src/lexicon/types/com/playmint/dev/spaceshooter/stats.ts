/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { BlobRef, ValidationResult } from '@atproto/lexicon';
import { lexicons } from '../../../../../lexicons';
import { hasProp, isObj } from '../../../../../util';

export interface Record {
    totalWins: number;
    totalGames: number;
    totalKills: number;
    totalDeaths: number;
    highestScore: number;
    [k: string]: unknown;
}

export function isRecord(v: unknown): v is Record {
    return (
        isObj(v) &&
        hasProp(v, '$type') &&
        (v.$type === 'com.playmint.dev.spaceshooter.stats#main' ||
            v.$type === 'com.playmint.dev.spaceshooter.stats')
    );
}

export function validateRecord(v: unknown): ValidationResult {
    return lexicons.validate('com.playmint.dev.spaceshooter.stats#main', v);
}
