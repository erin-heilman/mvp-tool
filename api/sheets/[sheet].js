// API route to fetch Google Sheets data
// This runs on the server side, avoiding CORS issues

const SHEET_ID = '1CHs8cP3mDQkwG-XL-B7twFVukRxcB4umn9VX9ZK2VqM';
const SHEET_GIDS = {
    clinicians: '0',
    measures: '1838421790',
    mvps: '467952052',
    benchmarks: '322699637',
    assignments: '1879320597',
    selections: '1724246569',
    performance: '557443576',
    work: '1972144134',
    config: '128453598'
};

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length === 0) return [];
    
    const headers = parseCSVLine(lines[0]);
    const data = [];
    
    for (let i = 1; i < lines.length; i++) {
        if (lines[i].trim()) {
            const values = parseCSVLine(lines[i]);
            if (values.length === headers.length) {
                const row = {};
                headers.forEach((header, index) => {
                    row[header] = values[index];
                });
                if (Object.values(row).some(v => v !== '')) {
                    data.push(row);
                }
            }
        }
    }
    
    return data;
}

function parseCSVLine(line) {
    const values = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        
        if (char === '"') {
            if (inQuotes && line[i + 1] === '"') {
                current += '"';
                i++;
            } else {
                inQuotes = !inQuotes;
            }
        } else if (char === ',' && !inQuotes) {
            values.push(current.trim());
            current = '';
        } else {
            current += char;
        }
    }
    
    values.push(current.trim());
    return values;
}

export default async function handler(req, res) {
    const { sheet } = req.query;
    
    if (!sheet || !SHEET_GIDS[sheet]) {
        return res.status(400).json({ error: 'Invalid sheet name' });
    }
    
    const gid = SHEET_GIDS[sheet];
    const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${gid}`;
    
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch sheet: ${response.status}`);
        }
        
        const csvText = await response.text();
        const data = parseCSV(csvText);
        
        res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate');
        res.status(200).json(data);
    } catch (error) {
        console.error(`Error fetching ${sheet}:`, error);
        res.status(500).json({ error: 'Failed to fetch sheet data' });
    }
}
