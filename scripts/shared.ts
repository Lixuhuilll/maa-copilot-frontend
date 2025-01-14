import { access } from 'fs/promises'
import { uniq, uniqBy } from 'lodash-es'
import fetch from 'node-fetch'
import { pinyin } from 'pinyin'
import simplebig from 'simplebig'

type Profession = { id: string; name: string }
type Professions = (Profession & { sub: Profession[] })[]

export async function fileExists(file: string) {
  try {
    await access(file)
    return true
  } catch (e) {
    return false
  }
}

function pinyinify(name: string) {
  return [
    pinyin(name, {
      compact: true,
      heteronym: true,
      style: pinyin.STYLE_NORMAL,
    }),
    pinyin(name, {
      compact: true,
      heteronym: true,
      style: pinyin.STYLE_FIRST_LETTER,
    }),
  ].flatMap((py) => py.map((el) => el.join('')))
}

function transformOperatorName(name: string) {
  const cleanedName = name.replace(/[”“"]/g, '')

  const traditional = simplebig.s2t(name) as string
  const cleanedTraditional = traditional.replace(/[”“"]/g, '')

  return {
    name,
    alias: uniq([
      ...pinyinify(cleanedName),
      traditional,
      cleanedTraditional,
      ...pinyinify(cleanedTraditional),
    ]).join(' '),
  }
}

const CHARACTER_TABLE_JSON_URL =
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/character_table.json'
const UNIEQUIP_TABLE_JSON_URL =
  'https://raw.githubusercontent.com/Kengxxiao/ArknightsGameData/master/zh_CN/gamedata/excel/uniequip_table.json'

const CHARACTER_BLOCKLIST = [
  'char_512_aprot', // 暮落(集成战略)：It's just not gonna be there.
  'token_10012_rosmon_shield', // 迷迭香的战术装备：It's just not gonna be there.
]

const PROFESSION_NAMES = {
  MEDIC: '医疗',
  WARRIOR: '近卫',
  SPECIAL: '特种',
  SNIPER: '狙击',
  PIONEER: '先锋',
  TANK: '重装',
  CASTER: '术师',
  SUPPORT: '辅助',
}

async function json(url: string) {
  return (await (await fetch(url)).json()) as any
}

export async function getOperators() {
  const [charTable, uniequipTable] = await Promise.all([
    json(CHARACTER_TABLE_JSON_URL),
    json(UNIEQUIP_TABLE_JSON_URL),
  ])

  const { subProfDict } = uniequipTable

  const opIds = Object.keys(charTable)
  const professions: Professions = []
  const result = uniqBy(
    opIds.flatMap((id) => {
      const op = charTable[id]
      if (['TRAP'].includes(op.profession)) return []

      if (!['TOKEN'].includes(op.profession)) {
        const prof = professions.find((p) => p.id === op.profession)
        if (!prof) {
          professions.push({
            id: op.profession,
            name: PROFESSION_NAMES[op.profession],
            sub: [
              {
                id: op.subProfessionId,
                name: subProfDict[op.subProfessionId].subProfessionName,
              },
            ],
          })
        } else if (!prof.sub.find((p) => p.id === op.subProfessionId)) {
          prof.sub.push({
            id: op.subProfessionId,
            name: subProfDict[op.subProfessionId].subProfessionName,
          })
        }
      }

      return [
        {
          id: id,
          subProf: op.subProfessionId,
          ...transformOperatorName(op.name),
          alt_name: op.appellation,
        },
      ]
    }),
    (el) => el.name,
  ).sort((a, b) => {
    return pinyin.compare(a.name, b.name) || a.id.localeCompare(b.id)
  })
  return {
    professions,
    operators: result.filter((el) => !CHARACTER_BLOCKLIST.includes(el.id)),
  }
}
