import React, { useState, useRef } from "react";
import { jsPDF } from "jspdf";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import "./styles.css";

const MAKTINTA_LOGO = process.env.PUBLIC_URL + "/logo-maktinta.png";

const f = (n) =>
  n.toLocaleString(undefined, {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
const toUSD = (val) =>
  "$" + Number(val).toLocaleString(undefined, { maximumFractionDigits: 0 });
const co2ToTrees = (co2) => Math.round(co2 / 0.0227);

export default function App() {
  // Inputs
  const [address, setAddress] = useState("");
  const [poolArea, setPoolArea] = useState(0);
  const [poolTemp, setPoolTemp] = useState(80);
  const [season, setSeason] = useState("year");
  const [gasCost, setGasCost] = useState(2.0);
  const [incentiveLocal, setIncentiveLocal] = useState(false);
  const [localIncentiveType, setLocalIncentiveType] = useState("percent");
  const [localIncentive, setLocalIncentive] = useState(0);

  const inputRef = useRef(null);

  // Sizing
  const panelArea = 40; // sqft per panel
  const panelPct = 0.75;
  const panelCost = 3750; // includes all costs
  const panelBTU = 32000; // BTU/day per panel

  const panelsNeeded = Math.ceil((panelPct * poolArea) / panelArea);
  const systemCost = panelsNeeded * panelCost;

  // Incentives
  const fedITC = 0.3 * systemCost;
  const taxRate = 0.3; // Depreciation shield at 30%
  const depreciationBase = systemCost - fedITC;
  const depreciationBenefit = depreciationBase * taxRate;
  let locIncent = 0;
  if (incentiveLocal && localIncentive) {
    if (localIncentiveType === "percent") {
      locIncent = systemCost * (Number(localIncentive) / 100);
    } else {
      locIncent = Number(localIncentive);
    }
  }
  const totalIncent = fedITC + depreciationBenefit + locIncent;
  const netCost = systemCost - totalIncent;

  // Pool season (days/year)
  const seasonDays = season === "year" ? 365 : 275; // March–Thanksgiving ~275 days

  // Energy savings
  const annualBTU = panelsNeeded * panelBTU * seasonDays;
  // Natural gas is 100,000 BTU/therm, 75% boiler efficiency
  const annTherms = annualBTU / (100000 * 0.75);
  const firstYearSavings = annTherms * gasCost;

  // Escalate gas price by 3% per year for ROI/cash flow
  const escalate = (base, rate, years) => {
    let arr = [];
    let sum = 0;
    for (let i = 1; i <= years; ++i) {
      const val = base * Math.pow(1 + rate, i - 1);
      arr.push(val);
      sum += val;
    }
    return { arr, sum };
  };
  const { arr: annualSavingsArray, sum: total20yrSavings } = escalate(
    firstYearSavings,
    0.03,
    20
  );
  const { arr: annualSavingsArray25, sum: total25yrSavings } = escalate(
    firstYearSavings,
    0.03,
    25
  );

  // Payback (years): Add up escalated annual savings until they exceed netCost
  let payback = null,
    cumulative = 0;
  for (let i = 0; i < annualSavingsArray.length; ++i) {
    cumulative += annualSavingsArray[i];
    if (!payback && cumulative >= netCost) payback = i + 1;
  }

  // ROI
  const roi20 = ((total20yrSavings - netCost) / netCost) * 100;

  // Cash Flow Data (for chart)
  const cashFlowData = [];
  let cum = -netCost;
  for (let i = 0; i <= 25; ++i) {
    if (i > 0) cum += annualSavingsArray25[i - 1];
    cashFlowData.push({ year: i, Cumulative: Math.round(cum) });
  }

  // CO2 offset
  const annCO2 = annTherms * 0.0053;
  const annTrees = co2ToTrees(annCO2);

  // PDF Export
  function exportPDF() {
    const doc = new jsPDF();
    let y = 15;
    doc.setFont("helvetica", "bold");
    doc.addImage(MAKTINTA_LOGO, "PNG", 10, y, 35, 15);
    doc.setFontSize(18);
    doc.text("Commercial Pool Solar Estimate", 50, y + 10);
    y += 22;

    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.text(`Address/ZIP: ${address}`, 10, y);
    y += 7;
    doc.text(`System Size: ${panelsNeeded} x 4'x10' panels`, 10, y);
    y += 7;
    doc.text(`Pool Surface Area: ${f(poolArea)} sqft`, 10, y);
    y += 7;
    doc.text(`Desired Pool Temp: ${poolTemp} °F`, 10, y);
    y += 7;
    doc.text(
      `Operating Season: ${
        season === "year" ? "Year-round" : "March to Thanksgiving"
      } (${seasonDays} days/year)`,
      10,
      y
    );
    y += 7;
    doc.setFont("helvetica", "bold");
    doc.text(`Total System Cost (after incentives): ${toUSD(netCost)}`, 10, y);
    y += 8;
    doc.setFont("helvetica", "normal");

    doc.text(`Federal ITC (30%): ${toUSD(fedITC)}`, 10, y);
    y += 6;
    doc.text(
      `Depreciation Tax Benefit (100% Year 1, 30% rate): ${toUSD(
        depreciationBenefit
      )}`,
      10,
      y
    );
    y += 6;
    if (locIncent) {
      doc.text(`Local Incentive: ${toUSD(locIncent)}`, 10, y);
      y += 6;
    }
    doc.text(`Net System Cost: ${toUSD(netCost)}`, 10, y);
    y += 8;

    doc.text(
      `Annual Savings (Year 1): ${f(annTherms)} therms, ${toUSD(
        firstYearSavings
      )}`,
      10,
      y
    );
    y += 6;
    doc.text(
      `Simple Payback: ${payback ? payback.toFixed(1) : "-"} years`,
      10,
      y
    );
    y += 6;
    doc.text(`20-year ROI: ${roi20 ? roi20.toFixed(0) : "-"}%`, 10, y);
    y += 6;
    doc.text(
      `Annual CO₂ Offset: ${annCO2.toFixed(2)} tons (~${annTrees} trees)`,
      10,
      y
    );
    y += 10;

    doc.setFont("helvetica", "bold");
    doc.setTextColor(200, 0, 0);
    doc.text(
      "Disclaimer: This tool provides a preliminary estimate for informational purposes only. For a more accurate proposal, contact Maktinta Energy at 408-432-9900 or visit www.maktinta.com.",
      10,
      y,
      { maxWidth: 180 }
    );
    doc.save("Maktinta_Pool_Solar_Estimate.pdf");
  }

  return (
    <div className="maktinta-calc">
      <header className="maktinta-header">
        <img
          src={MAKTINTA_LOGO}
          alt="Maktinta Energy"
          className="maktinta-logo"
        />
        <div className="maktinta-header-center">
          <h1>Commercial Pool Solar Calculator</h1>
          <div className="contact-bar">
            Tel: 408-432-9900 |{" "}
            <a href="https://www.maktinta.com" target="_blank" rel="noreferrer">
              www.maktinta.com
            </a>
          </div>
        </div>
      </header>

      <div className="maktinta-main">
        <div className="maktinta-row">
          <section className="input-section" ref={inputRef}>
            <h2>Project Inputs</h2>
            <label>
              Address or ZIP
              <br />
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>

            <label>
              Pool Surface Area (sqft)
              <br />
              <input
                type="number"
                min="0"
                value={poolArea}
                onChange={(e) => setPoolArea(Number(e.target.value))}
              />
            </label>

            <label>
              Desired Pool Temperature (°F)
              <br />
              <input
                type="number"
                min="50"
                max="100"
                value={poolTemp}
                onChange={(e) => setPoolTemp(Number(e.target.value))}
              />
            </label>

            <label>
              Operating Season
              <br />
              <select
                value={season}
                onChange={(e) => setSeason(e.target.value)}
              >
                <option value="year">Year-round</option>
                <option value="march">March to Thanksgiving</option>
              </select>
            </label>

            <label>
              Natural Gas Cost ($/therm)
              <br />
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={gasCost}
                onChange={(e) => setGasCost(Number(e.target.value))}
              />
            </label>

            <label>
              Local Incentive
              <br />
              <input
                type="checkbox"
                checked={incentiveLocal}
                onChange={(e) => setIncentiveLocal(e.target.checked)}
              />
              {incentiveLocal && (
                <>
                  <select
                    value={localIncentiveType}
                    onChange={(e) => setLocalIncentiveType(e.target.value)}
                  >
                    <option value="percent">%</option>
                    <option value="amount">$</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    value={localIncentive}
                    onChange={(e) =>
                      setLocalIncentive(e.target.value.replace(/^0+(?!\.)/, ""))
                    }
                    style={{ width: "70px", marginLeft: "5px" }}
                  />
                </>
              )}
            </label>
          </section>

          <section className="results-section">
            <h2>Summary & Results</h2>
            <table className="summary-table">
              <tbody>
                <tr>
                  <th>System Size</th>
                  <td>{panelsNeeded} x 4x10 panels</td>
                </tr>
                <tr>
                  <th>Pool Surface Area</th>
                  <td>{f(poolArea)} sqft</td>
                </tr>
                <tr>
                  <th>Desired Pool Temp</th>
                  <td>{poolTemp} °F</td>
                </tr>
                <tr>
                  <th>Operating Season</th>
                  <td>
                    {season === "year" ? "Year-round" : "March to Thanksgiving"}{" "}
                    ({seasonDays} days/year)
                  </td>
                </tr>
                <tr>
                  <th>Pre-incentive Cost</th>
                  <td>{toUSD(systemCost)}</td>
                </tr>
                <tr>
                  <th>Federal Incentive (ITC)</th>
                  <td>{toUSD(fedITC)}</td>
                </tr>
                <tr>
                  <th>Federal Depreciation (100% Year 1, 30% rate)</th>
                  <td>{toUSD(depreciationBenefit)}</td>
                </tr>
                {locIncent > 0 && (
                  <tr>
                    <th>Local Incentive</th>
                    <td>{toUSD(locIncent)}</td>
                  </tr>
                )}
                <tr>
                  <th>Net System Cost</th>
                  <td>{toUSD(netCost)}</td>
                </tr>
                <tr>
                  <th>Annual Savings</th>
                  <td>
                    {f(annTherms)} therms, {toUSD(firstYearSavings)}
                  </td>
                </tr>
                <tr>
                  <th>Simple Payback</th>
                  <td>{payback ? payback.toFixed(1) : "-"} years</td>
                </tr>
                <tr>
                  <th>20-Year ROI</th>
                  <td>{roi20 ? roi20.toFixed(0) : "-"}%</td>
                </tr>
                <tr>
                  <th>Annual CO₂ Offset</th>
                  <td>
                    {annCO2.toFixed(2)} tons (~{annTrees} trees)
                  </td>
                </tr>
              </tbody>
            </table>

            <h3>Cost</h3>
            <div className="summary-total-cost">
              <b>Total System Cost (after incentives): {toUSD(netCost)}</b>
            </div>
          </section>
        </div>
        <div className="graphics-section">
          <h3 style={{ marginBottom: 8 }}>Cumulative Cash Flow (25 Years)</h3>
          <div style={{ width: "100%", height: 200 }}>
            <ResponsiveContainer>
              <BarChart data={cashFlowData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="year"
                  label={{
                    value: "Year",
                    position: "insideBottomRight",
                    offset: -2,
                  }}
                />
                <YAxis />
                <Tooltip formatter={(value) => "$" + value.toLocaleString()} />
                <Bar dataKey="Cumulative" fill="#3571B8" />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div style={{ marginTop: 24 }}>
            <button className="pdf-btn" onClick={exportPDF}>
              Download PDF Report
            </button>
            <button
              className="pdf-btn"
              style={{ marginLeft: 12, background: "#bbb", color: "#222" }}
              onClick={() => {
                inputRef.current?.scrollIntoView({ behavior: "smooth" });
              }}
            >
              Edit Input
            </button>
          </div>
          <div className="disclaimer">
            <b>Disclaimer:</b> This tool provides a preliminary estimate for
            informational purposes only. For a more accurate proposal, contact
            Maktinta Energy at <b>408-432-9900</b> or visit{" "}
            <a href="https://www.maktinta.com" target="_blank" rel="noreferrer">
              www.maktinta.com
            </a>
            .
          </div>
        </div>
      </div>
    </div>
  );
}
