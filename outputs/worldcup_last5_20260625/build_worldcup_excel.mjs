import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const outputDir = __dirname;
const previewDir = path.join(outputDir, "previews");
const outputFile = path.join(outputDir, "betintel_world_cups_2006_2022_training_dataset.xlsx");

const YEARS = [2006, 2010, 2014, 2018, 2022];
const FOOTYSTATS_COMP_IDS = {
  2006: 1419,
  2010: 1389,
  2014: 1384,
  2018: 1425,
  2022: 7432,
};

const SOURCES = {
  fjelstulMatches: "https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/matches.csv",
  fjelstulBookings: "https://raw.githubusercontent.com/jfjelstul/worldcup/master/data-csv/bookings.csv",
  fjelstulRepo: "https://github.com/jfjelstul/worldcup",
  footystatsWorldCup: "https://footystats.org/world-cup",
  googleTerms: "https://policies.google.com/terms",
};

function footystatsMatchesUrl(year) {
  return `https://footystats.org/c-dl.php?comp=${FOOTYSTATS_COMP_IDS[year]}&type=matches`;
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (BetIntel academic dataset builder)",
      accept: "text/csv,text/plain,text/html,*/*",
    },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  }
  return await res.text();
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  const clean = text.replace(/^\uFEFF/, "");

  for (let i = 0; i < clean.length; i += 1) {
    const char = clean[i];
    const next = clean[i + 1];
    if (quoted) {
      if (char === '"' && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  return rows.filter((r) => r.some((v) => String(v).trim() !== ""));
}

function csvToObjects(text) {
  const rows = parseCsv(text);
  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      obj[header] = row[index] ?? "";
    });
    return obj;
  });
}

function toNumber(value) {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  if (text === "" || text.toUpperCase() === "N/A") return null;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function toInt(value) {
  const number = toNumber(value);
  return number === null ? null : Math.trunc(number);
}

function valueOrBlank(value) {
  return value === null || value === undefined ? "" : value;
}

function normalizeTeamName(name) {
  const ascii = String(name ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  const aliases = {
    usa: "united states",
    usmnt: "united states",
    "ir iran": "iran",
    "korea republic": "south korea",
    czechia: "czech republic",
    "cote d ivoire": "ivory coast",
  };
  return aliases[ascii] ?? ascii;
}

function matchKey(year, home, away, homeGoals, awayGoals) {
  return [
    year,
    normalizeTeamName(home),
    normalizeTeamName(away),
    String(homeGoals),
    String(awayGoals),
  ].join("|");
}

function colLetter(index1Based) {
  let index = index1Based;
  let out = "";
  while (index > 0) {
    const rem = (index - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    index = Math.floor((index - 1) / 26);
  }
  return out;
}

function cell(row, colIndex1Based) {
  return `${colLetter(colIndex1Based)}${row}`;
}

function resultFromScore(homeGoals, awayGoals) {
  if (homeGoals > awayGoals) return "H";
  if (homeGoals < awayGoals) return "A";
  return "D";
}

function officialWinner(match) {
  const homeWin = toInt(match.home_team_win) === 1;
  const awayWin = toInt(match.away_team_win) === 1;
  if (homeWin) return match.home_team_name;
  if (awayWin) return match.away_team_name;
  return "Draw";
}

function winnerBasis(match, scoreResult) {
  if (toInt(match.penalty_shootout) === 1) return "penalties";
  if (scoreResult === "D") return "draw_no_winner";
  if (toInt(match.extra_time) === 1) return "extra_time_score";
  return "score";
}

function aggregateBookings(bookings) {
  const empty = () => ({
    homeYellow: 0,
    awayYellow: 0,
    homeStraightRed: 0,
    awayStraightRed: 0,
    homeSecondYellow: 0,
    awaySecondYellow: 0,
    homeSendOff: 0,
    awaySendOff: 0,
  });
  const byMatch = new Map();
  for (const booking of bookings) {
    if (!YEARS.some((year) => booking.tournament_id === `WC-${year}`)) continue;
    if (!byMatch.has(booking.match_id)) byMatch.set(booking.match_id, empty());
    const stats = byMatch.get(booking.match_id);
    const isHome = toInt(booking.home_team) === 1;
    const prefix = isHome ? "home" : "away";
    stats[`${prefix}Yellow`] += toInt(booking.yellow_card) ?? 0;
    stats[`${prefix}StraightRed`] += toInt(booking.red_card) ?? 0;
    stats[`${prefix}SecondYellow`] += toInt(booking.second_yellow_card) ?? 0;
    stats[`${prefix}SendOff`] += toInt(booking.sending_off) ?? 0;
  }
  return byMatch;
}

function buildFootystatsMap(footystatsByYear) {
  const map = new Map();
  for (const [yearText, rows] of Object.entries(footystatsByYear)) {
    const year = Number(yearText);
    for (const row of rows) {
      const homeGoals = toInt(row.home_team_goal_count);
      const awayGoals = toInt(row.away_team_goal_count);
      const key = matchKey(year, row.home_team_name, row.away_team_name, homeGoals, awayGoals);
      map.set(key, row);
    }
  }
  return map;
}

function buildRows(matches, bookingsByMatch, footystatsMap) {
  const rows = [];
  const selected = matches
    .filter((match) => YEARS.some((year) => match.tournament_id === `WC-${year}`))
    .sort((a, b) => Number(a.key_id) - Number(b.key_id));

  if (selected.length !== 320) {
    throw new Error(`Expected 320 World Cup matches, found ${selected.length}`);
  }

  for (const match of selected) {
    const year = Number(match.tournament_id.replace("WC-", ""));
    const homeGoals = toInt(match.home_team_score);
    const awayGoals = toInt(match.away_team_score);
    const key = matchKey(year, match.home_team_name, match.away_team_name, homeGoals, awayGoals);
    const footy = footystatsMap.get(key);
    if (!footy) {
      throw new Error(`Missing FootyStats row for ${key}`);
    }

    const booking = bookingsByMatch.get(match.match_id) ?? {
      homeYellow: 0,
      awayYellow: 0,
      homeStraightRed: 0,
      awayStraightRed: 0,
      homeSecondYellow: 0,
      awaySecondYellow: 0,
      homeSendOff: 0,
      awaySendOff: 0,
    };

    const homeCornersRaw = toInt(footy.home_team_corner_count);
    const awayCornersRaw = toInt(footy.away_team_corner_count);
    const homeCorners = homeCornersRaw !== null && homeCornersRaw >= 0 ? homeCornersRaw : null;
    const awayCorners = awayCornersRaw !== null && awayCornersRaw >= 0 ? awayCornersRaw : null;
    const cornersStatus = homeCorners === null || awayCorners === null ? "dados_insuficientes" : "ok";
    const totalCorners = cornersStatus === "ok" ? homeCorners + awayCorners : null;
    const scoreResult = resultFromScore(homeGoals, awayGoals);
    const totalRedSendOffs = booking.homeSendOff + booking.awaySendOff;
    const totalCardsModel = booking.homeYellow + booking.awayYellow + totalRedSendOffs;
    const notes =
      cornersStatus === "dados_insuficientes"
        ? "Escanteios por partida indisponiveis no CSV FootyStats desta edicao; nao preencher com estimativa."
        : "";

    rows.push([
      year,
      match.tournament_name,
      match.match_id,
      match.stage_name,
      match.group_name,
      new Date(`${match.match_date}T00:00:00`),
      match.match_time,
      match.home_team_name,
      match.away_team_name,
      homeGoals,
      awayGoals,
      match.score,
      scoreResult,
      officialWinner(match),
      officialWinner(match) === "Draw" ? "" : officialWinner(match),
      winnerBasis(match, scoreResult),
      toInt(match.extra_time) === 1,
      toInt(match.penalty_shootout) === 1,
      match.score_penalties,
      valueOrBlank(homeCorners),
      valueOrBlank(awayCorners),
      valueOrBlank(totalCorners),
      cornersStatus,
      booking.homeYellow,
      booking.awayYellow,
      booking.homeYellow + booking.awayYellow,
      booking.homeStraightRed,
      booking.awayStraightRed,
      booking.homeStraightRed + booking.awayStraightRed,
      booking.homeSecondYellow,
      booking.awaySecondYellow,
      booking.homeSecondYellow + booking.awaySecondYellow,
      booking.homeSendOff,
      booking.awaySendOff,
      totalRedSendOffs,
      totalCardsModel,
      "ok",
      valueOrBlank(toInt(footy.home_team_shots)),
      valueOrBlank(toInt(footy.away_team_shots)),
      valueOrBlank(toInt(footy.home_team_shots_on_target)),
      valueOrBlank(toInt(footy.away_team_shots_on_target)),
      valueOrBlank(toNumber(footy.home_team_possession)),
      valueOrBlank(toNumber(footy.away_team_possession)),
      match.stadium_name,
      match.city_name,
      match.country_name,
      SOURCES.fjelstulMatches,
      SOURCES.fjelstulBookings,
      footystatsMatchesUrl(year),
      notes,
    ]);
  }
  return rows;
}

function buildLabelFormulas(rowCount, partCols) {
  const headers = [
    "match_id",
    "match_date",
    "competition_year",
    "home_team",
    "away_team",
    "FTHG",
    "FTAG",
    "FTR",
    "totalGoals",
    "over15",
    "over25",
    "over35",
    "under25",
    "under35",
    "bothTeamsScore",
    "doubleChance_1X",
    "doubleChance_12",
    "doubleChance_X2",
    "HC",
    "AC",
    "totalCorners",
    "corners_over85",
    "corners_over95",
    "HY",
    "AY",
    "HR",
    "AR",
    "totalCards",
    "cards_over35",
    "cards_over45",
    "cards_over55",
    "corners_status",
    "cards_status",
    "source_provider",
    "data_note",
  ];

  const formulas = [];
  for (let i = 0; i < rowCount; i += 1) {
    const p = i + 2;
    const r = i + 2;
    const FTHG = cell(r, 6);
    const FTAG = cell(r, 7);
    const FTR = cell(r, 8);
    const totalGoals = cell(r, 9);
    const HC = cell(r, 19);
    const AC = cell(r, 20);
    const totalCorners = cell(r, 21);
    const HY = cell(r, 24);
    const AY = cell(r, 25);
    const HR = cell(r, 26);
    const AR = cell(r, 27);
    const totalCards = cell(r, 28);
    formulas.push([
      `='Partidas'!${partCols.match_id}${p}`,
      `='Partidas'!${partCols.match_date}${p}`,
      `='Partidas'!${partCols.tournament_year}${p}`,
      `='Partidas'!${partCols.home_team}${p}`,
      `='Partidas'!${partCols.away_team}${p}`,
      `='Partidas'!${partCols.home_goals}${p}`,
      `='Partidas'!${partCols.away_goals}${p}`,
      `='Partidas'!${partCols.result_1x2}${p}`,
      `=${FTHG}+${FTAG}`,
      `=${totalGoals}>1.5`,
      `=${totalGoals}>2.5`,
      `=${totalGoals}>3.5`,
      `=${totalGoals}<2.5`,
      `=${totalGoals}<3.5`,
      `=AND(${FTHG}>0,${FTAG}>0)`,
      `=OR(${FTR}="H",${FTR}="D")`,
      `=OR(${FTR}="H",${FTR}="A")`,
      `=OR(${FTR}="D",${FTR}="A")`,
      `='Partidas'!${partCols.home_corners}${p}`,
      `='Partidas'!${partCols.away_corners}${p}`,
      `=IF(OR(${HC}="",${AC}=""),"",${HC}+${AC})`,
      `=IF(${totalCorners}="","dados_insuficientes",${totalCorners}>8.5)`,
      `=IF(${totalCorners}="","dados_insuficientes",${totalCorners}>9.5)`,
      `='Partidas'!${partCols.home_yellow_cards}${p}`,
      `='Partidas'!${partCols.away_yellow_cards}${p}`,
      `='Partidas'!${partCols.home_red_card_sendoffs}${p}`,
      `='Partidas'!${partCols.away_red_card_sendoffs}${p}`,
      `=${HY}+${AY}+${HR}+${AR}`,
      `=${totalCards}>3.5`,
      `=${totalCards}>4.5`,
      `=${totalCards}>5.5`,
      `='Partidas'!${partCols.corners_status}${p}`,
      `='Partidas'!${partCols.cards_status}${p}`,
      `="Fjelstul World Cup Database + FootyStats CSV"`,
      `='Partidas'!${partCols.notes}${p}`,
    ]);
  }
  return { headers, formulas };
}

function addTable(sheet, name, rowCount, colCount) {
  const rangeAddress = `A1:${colLetter(colCount)}${rowCount}`;
  const table = sheet.tables.add(rangeAddress, true, name);
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  return table;
}

function styleSheet(sheet, headerRange, usedRange, options = {}) {
  sheet.showGridLines = false;
  usedRange.format = {
    font: { color: "#111827" },
  };
  headerRange.format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF" },
    wrapText: true,
    verticalAlignment: "center",
  };
  headerRange.format.rowHeight = 28;
  usedRange.format.autofitColumns();
  usedRange.format.autofitRows();
  if (options.freezeRows) sheet.freezePanes.freezeRows(options.freezeRows);
  if (options.freezeColumns) sheet.freezePanes.freezeColumns(options.freezeColumns);
}

function writeMatrix(sheet, startRow, startCol, matrix) {
  const colCount = Math.max(...matrix.map((row) => row.length));
  const padded = matrix.map((row) => [...row, ...Array(colCount - row.length).fill("")]);
  sheet.getRangeByIndexes(startRow, startCol, padded.length, colCount).values = padded;
}

function writeFormulaMatrix(sheet, startRow, startCol, matrix) {
  const colCount = Math.max(...matrix.map((row) => row.length));
  const padded = matrix.map((row) => [...row, ...Array(colCount - row.length).fill("")]);
  sheet.getRangeByIndexes(startRow, startCol, padded.length, colCount).formulas = padded;
}

function buildPartColumnMap(headers) {
  const map = {};
  headers.forEach((header, index) => {
    map[header] = colLetter(index + 1);
  });
  return map;
}

function sourceRows() {
  const rows = [
    ["Tipo", "Fonte", "URL", "Uso na planilha", "Licenca/observacao"],
    [
      "Resultados e metadados",
      "Fjelstul World Cup Database",
      SOURCES.fjelstulRepo,
      "Partidas, placares, sede, fase, prorrogacao, penaltis e IDs de partida.",
      "Repositorio informa CC-BY-SA 4.0; manter atribuicao ao reutilizar.",
    ],
    [
      "Resultados CSV",
      "matches.csv",
      SOURCES.fjelstulMatches,
      "Fonte bruta baixada para resultados das Copas 2006-2022.",
      "Sem odds; dados historicos para uso academico.",
    ],
    [
      "Cartoes CSV",
      "bookings.csv",
      SOURCES.fjelstulBookings,
      "Cartoes amarelos, vermelhos diretos, segundo amarelo e expulsao por partida/equipe.",
      "TotalCards do modelo usa amarelos + expulsoes, alinhado a HY+AY+HR+AR.",
    ],
    [
      "Escanteios e estatisticas",
      "FootyStats World Cup CSV",
      SOURCES.footystatsWorldCup,
      "Escanteios por equipe/partida, chutes e posse quando disponiveis.",
      "Odds do CSV foram ignoradas intencionalmente.",
    ],
    ...YEARS.map((year) => [
      "Escanteios CSV direto",
      `FootyStats ${year}`,
      footystatsMatchesUrl(year),
      `CSV de partidas da Copa ${year}.`,
      year === 2006
        ? "Escanteios aparecem como -1 em todas as partidas; marcados como dados_insuficientes."
        : "Escanteios disponiveis por partida.",
    ]),
    [
      "Google",
      "Google Search / paineis esportivos",
      SOURCES.googleTerms,
      "Nao usado como dataset de treino.",
      "Google agrega dados de terceiros; raspagem automatizada nao e uma fonte reproduzivel/licenciada para treino.",
    ],
  ];
  return rows;
}

function dictionaryRows() {
  return [
    ["Coluna", "Aba", "Descricao"],
    ["FTHG / FTAG", "Labels_Modelo", "Gols do mandante/visitante no placar final da fonte, excluindo disputa de penaltis."],
    ["FTR", "Labels_Modelo", "Resultado derivado do placar: H, D ou A."],
    ["official_winner", "Partidas", "Vencedor oficial segundo a base Fjelstul; em jogos decididos nos penaltis pode diferir de FTR."],
    ["HC / AC", "Labels_Modelo", "Escanteios mandante/visitante. Vazio quando a fonte traz valor ausente."],
    ["HY / AY", "Labels_Modelo", "Cartoes amarelos por equipe agregados de bookings.csv."],
    ["HR / AR", "Labels_Modelo", "Expulsoes por equipe: vermelho direto ou segundo amarelo, via sending_off."],
    ["totalCards", "Labels_Modelo", "HY + AY + HR + AR, coerente com o harness BetIntel."],
    ["corners_status", "Labels_Modelo", "ok ou dados_insuficientes; 2006 fica insuficiente para escanteios por partida."],
    ["cards_status", "Labels_Modelo", "ok nas cinco edicoes porque bookings.csv cobre os torneios."],
    ["odds", "Todas", "Odds reais nao foram importadas para evitar uso como recomendacao financeira."],
  ];
}

async function main() {
  await fs.mkdir(previewDir, { recursive: true });

  const [matchesCsv, bookingsCsv, ...footyCsvs] = await Promise.all([
    fetchText(SOURCES.fjelstulMatches),
    fetchText(SOURCES.fjelstulBookings),
    ...YEARS.map((year) => fetchText(footystatsMatchesUrl(year))),
  ]);

  const matches = csvToObjects(matchesCsv);
  const bookings = csvToObjects(bookingsCsv);
  const footystatsByYear = {};
  YEARS.forEach((year, index) => {
    footystatsByYear[year] = csvToObjects(footyCsvs[index]);
    if (footystatsByYear[year].length !== 64) {
      throw new Error(`Expected 64 FootyStats rows for ${year}, found ${footystatsByYear[year].length}`);
    }
  });

  const rows = buildRows(matches, aggregateBookings(bookings), buildFootystatsMap(footystatsByYear));
  const workbook = Workbook.create();

  const resumo = workbook.worksheets.add("Resumo");
  const partidas = workbook.worksheets.add("Partidas");
  const labels = workbook.worksheets.add("Labels_Modelo");
  const porEdicao = workbook.worksheets.add("Por_Edicao");
  const dicionario = workbook.worksheets.add("Dicionario");
  const fontes = workbook.worksheets.add("Fontes_Limitacoes");

  const partHeaders = [
    "tournament_year",
    "tournament_name",
    "match_id",
    "stage",
    "group_name",
    "match_date",
    "match_time",
    "home_team",
    "away_team",
    "home_goals",
    "away_goals",
    "score",
    "result_1x2",
    "official_result",
    "winner_team",
    "winner_basis",
    "extra_time",
    "penalty_shootout",
    "penalty_score",
    "home_corners",
    "away_corners",
    "total_corners",
    "corners_status",
    "home_yellow_cards",
    "away_yellow_cards",
    "total_yellow_cards",
    "home_straight_red_cards",
    "away_straight_red_cards",
    "total_straight_red_cards",
    "home_second_yellow_cards",
    "away_second_yellow_cards",
    "total_second_yellow_cards",
    "home_red_card_sendoffs",
    "away_red_card_sendoffs",
    "total_red_card_sendoffs",
    "total_cards_model",
    "cards_status",
    "home_shots",
    "away_shots",
    "home_shots_on_target",
    "away_shots_on_target",
    "home_possession",
    "away_possession",
    "stadium",
    "city",
    "country",
    "results_source",
    "cards_source",
    "corners_source",
    "notes",
  ];

  writeMatrix(partidas, 0, 0, [partHeaders, ...rows]);
  addTable(partidas, "PartidasTable", rows.length + 1, partHeaders.length);
  styleSheet(
    partidas,
    partidas.getRange(`A1:${colLetter(partHeaders.length)}1`),
    partidas.getRange(`A1:${colLetter(partHeaders.length)}${rows.length + 1}`),
    { freezeRows: 1, freezeColumns: 7 },
  );
  partidas.getRange(`F2:F${rows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
  partidas.getRange(`J2:K${rows.length + 1}`).format.numberFormat = "#,##0";
  partidas.getRange(`T2:V${rows.length + 1}`).format.numberFormat = "#,##0";
  partidas.getRange(`X2:AJ${rows.length + 1}`).format.numberFormat = "#,##0";
  partidas.getRange(`AL2:AM${rows.length + 1}`).format.numberFormat = "0.0";
  partidas.getRange("A:A").format.columnWidth = 12;
  partidas.getRange("B:B").format.columnWidth = 27;
  partidas.getRange("C:C").format.columnWidth = 12;
  partidas.getRange("F:F").format.columnWidth = 13;
  partidas.getRange("H:I").format.columnWidth = 18;
  partidas.getRange("AU:AX").format.columnWidth = 55;

  const partCols = buildPartColumnMap(partHeaders);
  const labelData = buildLabelFormulas(rows.length, partCols);
  writeMatrix(labels, 0, 0, [labelData.headers]);
  writeFormulaMatrix(labels, 1, 0, labelData.formulas);
  addTable(labels, "LabelsModeloTable", rows.length + 1, labelData.headers.length);
  styleSheet(
    labels,
    labels.getRange(`A1:${colLetter(labelData.headers.length)}1`),
    labels.getRange(`A1:${colLetter(labelData.headers.length)}${rows.length + 1}`),
    { freezeRows: 1, freezeColumns: 5 },
  );
  labels.getRange(`B2:B${rows.length + 1}`).format.numberFormat = "yyyy-mm-dd";
  labels.getRange(`F2:G${rows.length + 1}`).format.numberFormat = "#,##0";
  labels.getRange(`I2:I${rows.length + 1}`).format.numberFormat = "#,##0";
  labels.getRange(`S2:AB${rows.length + 1}`).format.numberFormat = "#,##0";
  labels.getRange("A:A").format.columnWidth = 13;
  labels.getRange("D:E").format.columnWidth = 18;
  labels.getRange("AI:AI").format.columnWidth = 55;

  const summaryHeaders = [
    "Ano",
    "Partidas",
    "Gols",
    "Media gols",
    "H",
    "D",
    "A",
    "Partidas com escanteios",
    "Total escanteios",
    "Media escanteios",
    "Total amarelos",
    "Total expulsoes",
    "TotalCards modelo",
    "Media cards modelo",
  ];
  writeMatrix(porEdicao, 0, 0, [summaryHeaders, ...YEARS.map((year) => [year])]);
  const partLastRow = rows.length + 1;
  const summaryFormulas = YEARS.map((year, idx) => {
    const r = idx + 2;
    return [
      null,
      `=COUNTIF('Partidas'!$A$2:$A$${partLastRow},A${r})`,
      `=SUMIF('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$J$2:$J$${partLastRow})+SUMIF('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$K$2:$K$${partLastRow})`,
      `=C${r}/B${r}`,
      `=COUNTIFS('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$M$2:$M$${partLastRow},"H")`,
      `=COUNTIFS('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$M$2:$M$${partLastRow},"D")`,
      `=COUNTIFS('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$M$2:$M$${partLastRow},"A")`,
      `=COUNTIFS('Partidas'!$A$2:$A$${partLastRow},A${r},'Partidas'!$W$2:$W$${partLastRow},"ok")`,
      `=SUMIFS('Partidas'!$V$2:$V$${partLastRow},'Partidas'!$A$2:$A$${partLastRow},A${r})`,
      `=IF(H${r}=0,"dados_insuficientes",I${r}/H${r})`,
      `=SUMIFS('Partidas'!$Z$2:$Z$${partLastRow},'Partidas'!$A$2:$A$${partLastRow},A${r})`,
      `=SUMIFS('Partidas'!$AI$2:$AI$${partLastRow},'Partidas'!$A$2:$A$${partLastRow},A${r})`,
      `=SUMIFS('Partidas'!$AJ$2:$AJ$${partLastRow},'Partidas'!$A$2:$A$${partLastRow},A${r})`,
      `=M${r}/B${r}`,
    ];
  });
  writeFormulaMatrix(porEdicao, 1, 1, summaryFormulas.map((r) => r.slice(1)));
  addTable(porEdicao, "PorEdicaoTable", YEARS.length + 1, summaryHeaders.length);
  styleSheet(
    porEdicao,
    porEdicao.getRange(`A1:${colLetter(summaryHeaders.length)}1`),
    porEdicao.getRange(`A1:${colLetter(summaryHeaders.length)}${YEARS.length + 1}`),
    { freezeRows: 1 },
  );
  porEdicao.getRange("D2:D6").format.numberFormat = "0.00";
  porEdicao.getRange("J2:J6").format.numberFormat = "0.00";
  porEdicao.getRange("N2:N6").format.numberFormat = "0.00";

  writeMatrix(resumo, 0, 0, [
    ["BetIntel AI - Dataset de treino das ultimas 5 Copas concluidas"],
    ["Escopo", "Copas do Mundo masculinas FIFA 2006, 2010, 2014, 2018 e 2022."],
    ["Uso recomendado", "Treino/evaluacao educacional. Analise baseada em dados historicos. Nao garante resultado."],
    ["Google", "Nao foi usado como fonte de treino; o arquivo usa fontes CSV reproduziveis e URLs auditaveis."],
    ["Odds", "Odds reais foram ignoradas e nao constam nas abas de treino."],
    [""],
    ["Indicador", "Valor"],
    ["Partidas", `=SUM('Por_Edicao'!B2:B6)`],
    ["Partidas com escanteios", `=SUM('Por_Edicao'!H2:H6)`],
    ["Partidas sem escanteios por partida", `=B8-B9`],
    ["Gols", `=SUM('Por_Edicao'!C2:C6)`],
    ["TotalCards modelo", `=SUM('Por_Edicao'!M2:M6)`],
    ["Fonte principal resultados/cartoes", SOURCES.fjelstulRepo],
    ["Fonte principal escanteios", SOURCES.footystatsWorldCup],
  ]);
  resumo.getRange("A1:B1").merge();
  resumo.getRange("A1:B1").format = {
    fill: "#111827",
    font: { bold: true, color: "#FFFFFF", size: 14 },
  };
  resumo.getRange("A2:A5").format = { font: { bold: true } };
  resumo.getRange("A7:B7").format = {
    fill: "#374151",
    font: { bold: true, color: "#FFFFFF" },
  };
  resumo.getRange("A1:B14").format.autofitColumns();
  resumo.getRange("A:A").format.columnWidth = 32;
  resumo.getRange("B:B").format.columnWidth = 95;
  resumo.showGridLines = false;

  const dict = dictionaryRows();
  writeMatrix(dicionario, 0, 0, dict);
  addTable(dicionario, "DicionarioTable", dict.length, dict[0].length);
  styleSheet(
    dicionario,
    dicionario.getRange(`A1:${colLetter(dict[0].length)}1`),
    dicionario.getRange(`A1:${colLetter(dict[0].length)}${dict.length}`),
    { freezeRows: 1 },
  );
  dicionario.getRange("A:A").format.columnWidth = 24;
  dicionario.getRange("B:B").format.columnWidth = 18;
  dicionario.getRange("C:C").format.columnWidth = 95;

  const sourceData = sourceRows();
  writeMatrix(fontes, 0, 0, sourceData);
  addTable(fontes, "FontesLimitacoesTable", sourceData.length, sourceData[0].length);
  styleSheet(
    fontes,
    fontes.getRange(`A1:${colLetter(sourceData[0].length)}1`),
    fontes.getRange(`A1:${colLetter(sourceData[0].length)}${sourceData.length}`),
    { freezeRows: 1 },
  );
  fontes.getRange("A:A").format.columnWidth = 24;
  fontes.getRange("B:B").format.columnWidth = 28;
  fontes.getRange("C:C").format.columnWidth = 85;
  fontes.getRange("D:E").format.columnWidth = 65;

  const qa = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 300 },
    summary: "formula error scan",
  });
  console.log(qa.ndjson);

  const previewSpecs = [
    ["Resumo", "A1:B14"],
    ["Partidas", "A1:AX18"],
    ["Labels_Modelo", "A1:AI18"],
    ["Por_Edicao", "A1:N6"],
    ["Dicionario", "A1:C12"],
    ["Fontes_Limitacoes", "A1:E13"],
  ];
  for (const [sheetName, range] of previewSpecs) {
    const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
    await fs.writeFile(
      path.join(previewDir, `${sheetName}.png`),
      new Uint8Array(await preview.arrayBuffer()),
    );
  }

  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputFile);
  console.log(JSON.stringify({ outputFile, rows: rows.length }, null, 2));
}

await main();
