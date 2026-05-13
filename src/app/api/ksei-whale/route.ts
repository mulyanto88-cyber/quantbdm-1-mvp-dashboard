import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code')?.toUpperCase();

  if (!code) {
    return NextResponse.json({ error: 'Stock code is required' }, { status: 400 });
  }

  try {
    const csvPath = path.join(process.cwd(), 'ksei_data1persen_mutasi_rows.csv');
    const fileContent = fs.readFileSync(csvPath, 'utf8');
    const lines = fileContent.split('\n');
    const headers = lines[0].split(',');

    const rows = lines.slice(1)
      .filter(line => line.includes(`,${code},`))
      .map(line => {
        const values = line.split(',');
        const obj: any = {};
        headers.forEach((header, index) => {
          obj[header.trim()] = values[index]?.trim();
        });
        return obj;
      })
      .filter(row => row.share_code === code);

    if (rows.length === 0) {
      return NextResponse.json({ data: [], holderAnalytics: null });
    }

    // Sort by date
    rows.sort((a, b) => a.date.localeCompare(b.date));

    const uniqueDates = Array.from(new Set(rows.map(r => r.date))).sort();
    const latestDate = uniqueDates[uniqueDates.length - 1];
    const previousDate = uniqueDates.length > 1 ? uniqueDates[uniqueDates.length - 2] : null;

    const latestWhales = rows.filter(r => r.date === latestDate);
    const previousWhales = previousDate ? rows.filter(r => r.date === previousDate) : [];

    const processedWhales = latestWhales.map(w => {
      const prev = previousWhales.find(p => p.investor_name === w.investor_name);
      const latestPercentage = parseFloat(w.percentage || '0');
      const previousPercentage = prev ? parseFloat(prev.percentage || '0') : 0;
      const changePct = latestPercentage - previousPercentage;

      // Whale DNA Categorization - REFINED
      let dna = 'HNW';
      const type = w.investor_type?.toLowerCase() || '';
      const name = w.investor_name?.toLowerCase() || '';

      // 1. STRATEGIC: Locked shares (Owner/Founder/Sovereign)
      if (
        type.includes('corporate') || 
        type.includes('sovereign') || 
        type.includes('government') ||
        (type.includes('individual') && latestPercentage >= 5)
      ) {
        // Exception: Corporate that are actually Funds/Asset Managers
        if (name.includes('asset management') || name.includes('reksadana') || name.includes('sekuritas') || name.includes('fund')) {
          dna = 'Institutional';
        } else {
          dna = 'Strategic';
        }
      } 
      // 2. INSTITUTIONAL (Smart Money): Active money managers
      else if (
        type.includes('insurance') || 
        type.includes('pension') || 
        type.includes('mutual') || 
        type.includes('financial') || 
        type.includes('securities') ||
        name.includes('fund') ||
        name.includes('am ')
      ) {
        dna = 'Institutional';
      }
      // 3. CUSTODY (Opaque): Often nominees
      else if (type.includes('bank')) {
        dna = 'Custody';
      }

      return {
        ...w,
        dna,
        latest_percentage: latestPercentage,
        previous_percentage: previousPercentage,
        change_percentage: changePct,
        position_trend: changePct > 0 ? 'INCREASING' : changePct < 0 ? 'DECREASING' : 'STABLE',
        whale_verdict: changePct > 0 ? 'ADDING_POSITION' : changePct < 0 ? 'TRIMMING' : 'HOLDING',
        latest_shares: parseInt(w.total_holding_shares || '0'),
      };
    });

    // Real Free Float Calculation
    // Total % owned by Strategic holders (The 'Locked' shares)
    const strategicTotal = processedWhales
      .filter(w => w.dna === 'Strategic')
      .reduce((sum, w) => sum + w.latest_percentage, 0);
    
    // Real Free Float = 100% - Strategic
    const realFreeFloat = 100 - strategicTotal;

    const localWhales = processedWhales.filter(w => w.local_foreign === 'L');
    const foreignWhales = processedWhales.filter(w => w.local_foreign === 'F');

    const holderAnalytics = {
      strategicPct: strategicTotal,
      institutionalPct: processedWhales.filter(w => w.dna === 'Institutional').reduce((sum, w) => sum + w.latest_percentage, 0),
      custodyPct: processedWhales.filter(w => w.dna === 'Custody').reduce((sum, w) => sum + w.latest_percentage, 0),
      hnwPct: processedWhales.filter(w => w.dna === 'HNW').reduce((sum, w) => sum + w.latest_percentage, 0),
      localPct: localWhales.reduce((sum, w) => sum + w.latest_percentage, 0),
      foreignPct: foreignWhales.reduce((sum, w) => sum + w.latest_percentage, 0),
      realFreeFloat: realFreeFloat,
      concentration: processedWhales
        .sort((a, b) => b.latest_percentage - a.latest_percentage)
        .slice(0, 5)
        .reduce((sum, w) => sum + w.latest_percentage, 0),
      isCorneringRisk: realFreeFloat < 15,
      verdict: realFreeFloat < 20 ? 'TIGHT_LIQUIDITY' : realFreeFloat > 50 ? 'HIGH_LIQUIDITY' : 'NORMAL'
    };

    return NextResponse.json({ 
      whales: processedWhales,
      holderAnalytics,
      dates: uniqueDates,
      lastUpdated: latestDate
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
