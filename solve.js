// Fast drop-in for csv-reader 1.0.0 (make.fun's own CSV reader).
// Returns exactly what csv-reader 1.0.0 returns for every input:
// {columns, rows, errors} for {text, header}.
//
// Strategy: the reference walks one character at a time, appending one
// character at a time. This implementation instead jumps from delimiter to
// delimiter with String.indexOf (a memchr-style scan in C++) and takes
// each field out with String.slice. A '\r' is only ever looked for inside
// the short slice already in hand, never with an unbounded search, so no
// scan can run past the field it belongs to. Quoted fields are handled
// the same way: jump to the next quote, and only a segment that actually
// holds a CR or LF pays for newline normalisation. Field readers return
// their end in a small integer and leave the value in `fValue`, so the
// hot path allocates no per-field result object.
//
// Field-end codes: 0 = comma (record goes on), 1 = line break (record
// ends), 2 = end of text (record ends).

/** csv-reader 1.0.0's answer for one case's input. */
export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = 0; // the next character to read
  let line = 1; // the line that character is on
  if (text.charCodeAt(0) === 0xfeff) pos = 1;

  // The record being read: the line it starts on and the index in rows it takes (null: the header).
  let recordLine = 1;
  let recordRow = null;

  // The last field read: its value, and how many characters readUnquoted
  // kept onto it (the quote_junk check reads this).
  let fValue = '';
  let fAdded = 0;

  // Normalise a quoted segment: CRLF and lone CR each become one LF, and
  // `line` advances once per line break the segment held. Segments with no
  // CR or LF are returned untouched, which is the common case.
  function normalize(seg) {
    if (seg.indexOf('\r') === -1) {
      let i = -1;
      let count = 0;
      while ((i = seg.indexOf('\n', i + 1)) !== -1) count += 1;
      line += count;
      return seg;
    }
    const out = seg.replace(/\r\n?/g, '\n');
    let i = -1;
    let count = 0;
    while ((i = out.indexOf('\n', i + 1)) !== -1) count += 1;
    line += count;
    return out;
  }

  // Reads unquoted characters onto `value` up to the next comma or line
  // break: a CR not followed by LF is dropped (stray_cr). Returns how the
  // field ended; the value is left in `fValue`, the kept count in `fAdded`.
  function readUnquoted(value) {
    let v = value;
    let added = 0;
    for (;;) {
      const comma = text.indexOf(',', pos);
      const nl = text.indexOf('\n', pos);
      let end;
      let kind; // 0 comma, 1 line break, 2 end of text
      if (comma === -1) {
        if (nl === -1) {
          end = n;
          kind = 2;
        } else {
          end = nl;
          kind = 1;
        }
      } else if (nl === -1) {
        end = comma;
        kind = 0;
      } else if (comma < nl) {
        end = comma;
        kind = 0;
      } else {
        end = nl;
        kind = 1;
      }
      // The segment [pos, end) can only hold stray CRs, plus a CR at its
      // very end when the field ends at a line break (CRLF).
      let s = pos;
      for (;;) {
        const seg = text.slice(s, end);
        const cr = seg.indexOf('\r');
        if (cr === -1) {
          v += seg;
          added += seg.length;
          break;
        }
        if (cr === seg.length - 1 && kind === 1) {
          // CRLF: the field ends at the CR.
          v += seg.slice(0, cr);
          added += cr;
          pos = end + 1;
          line += 1;
          fValue = v;
          fAdded = added;
          return 1;
        }
        // Stray CR: dropped, error, and the field goes on after it.
        v += seg.slice(0, cr);
        added += cr;
        errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
        s += cr + 1;
      }
      pos = end;
      if (kind === 0) {
        pos += 1;
        fValue = v;
        fAdded = added;
        return 0;
      }
      if (kind === 1) {
        pos += 1;
        line += 1;
        fValue = v;
        fAdded = added;
        return 1;
      }
      fValue = v;
      fAdded = added;
      return 2;
    }
  }

  // Reads a quoted field whose opening quote is at pos. Returns how the
  // field ended; the value is left in `fValue`.
  function readQuoted() {
    const open = pos;
    const openLine = line;
    let v = '';
    pos += 1;
    let closed = false;
    for (;;) {
      const q = text.indexOf('"', pos);
      if (q === -1) break;
      if (text.charCodeAt(q + 1) === 34) {
        // A doubled quote: one quote in the value, and the field goes on.
        v += normalize(text.slice(pos, q));
        v += '"';
        pos = q + 2;
        continue;
      }
      // The closing quote.
      v += normalize(text.slice(pos, q));
      pos = q + 1;
      closed = true;
      break;
    }
    if (!closed) {
      // The quote never closes: it is a literal character, and the text
      // after it is read again as unquoted.
      pos = open + 1;
      line = openLine;
      errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
      return readUnquoted('"');
    }
    if (pos >= n) {
      fValue = v;
      fAdded = 0;
      return 2;
    }
    const c = text.charCodeAt(pos);
    if (c === 44) {
      pos += 1;
      fValue = v;
      fAdded = 0;
      return 0;
    }
    if (c === 10) {
      pos += 1;
      line += 1;
      fValue = v;
      fAdded = 0;
      return 1;
    }
    if (c === 13 && text.charCodeAt(pos + 1) === 10) {
      pos += 2;
      line += 1;
      fValue = v;
      fAdded = 0;
      return 1;
    }
    // What follows the closing quote is appended as it stands, up to the
    // next comma or line break.
    const ended = readUnquoted(v);
    if (fAdded > 0) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
    return ended;
  }

  for (;;) {
    // Lines with no characters are no records.
    while (pos < n) {
      if (text.charCodeAt(pos) === 10) {
        pos += 1;
        line += 1;
      } else if (text.charCodeAt(pos) === 13 && text.charCodeAt(pos + 1) === 10) {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;
    const fields = [];
    let ended;
    let quoted;
    do {
      quoted = text.charCodeAt(pos) === 34;
      ended = quoted ? readQuoted() : readUnquoted('');
      fields.push(fValue);
    } while (ended === 0);

    // A line that held only stray CRs is left with no characters: no record (its stray_cr errors stay).
    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
