import { InstitutionalData, MarginData, DailyPriceData, FinMindCombinedData } from "../types";

const FINMIND_API_URL = "https://api.finmindtrade.com/api/v4/data";
const API_TOKEN = "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9.eyJkYXRlIjoiMjAyNS0xMS0yMyAxMzozNDoyMCIsInVzZXJfaWQiOiJjaGloY2h1bmdqbyIsImlwIjoiMTE4LjE2OC4yMTUuMTk4In0.KzP7-d56UOJAJUDlQ-b3NaVsKe0rv1gsDtHXbnQeJwg";

const getStartDate = (daysAgo: number) => {
  const date = new Date();
  date.setDate(date.getDate() - daysAgo);
  return date.toISOString().split('T')[0];
};

export const fetchFinMindData = async (stockId: string): Promise<FinMindCombinedData[]> => {
  // Fetch more days to ensure we have enough trading days
  const startDate = getStartDate(60); 

  try {
    // 1. Fetch Institutional Investors (三大法人)
    const instRes = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockInstitutionalInvestorsBuySell&data_id=${stockId}&start_date=${startDate}&token=${API_TOKEN}`);
    const instJson = await instRes.json();
    const instData: InstitutionalData[] = Array.isArray(instJson.data) ? instJson.data : [];

    // 2. Fetch Margin Trading (融資融券)
    const marginRes = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockMarginPurchaseShortSale&data_id=${stockId}&start_date=${startDate}&token=${API_TOKEN}`);
    const marginJson = await marginRes.json();
    const marginData: MarginData[] = Array.isArray(marginJson.data) ? marginJson.data : [];

    // 3. Fetch Price (股價)
    const priceRes = await fetch(`${FINMIND_API_URL}?dataset=TaiwanStockPrice&data_id=${stockId}&start_date=${startDate}&token=${API_TOKEN}`);
    const priceJson = await priceRes.json();
    const priceData: DailyPriceData[] = Array.isArray(priceJson.data) ? priceJson.data : [];

    // Combine Data by Date
    // Get unique dates from price data
    const dates = priceData.map(p => p.date).sort();
    // Keep only last 30 days maximum
    const recentDates = dates.slice(-30);

    const combined: FinMindCombinedData[] = recentDates.map(date => {
      // Filter Institutional Data
      const dayInst = instData.filter(d => d.date === date);
      
      const calcNet = (name: string) => {
        const item = dayInst.find(d => d.name === name);
        // FORCE NUMBER CONVERSION
        const buy = item && item.buy ? Number(item.buy) : 0;
        const sell = item && item.sell ? Number(item.sell) : 0;
        return buy - sell;
      };

      const foreignNet = calcNet("Foreign_Investor");
      const trustNet = calcNet("Investment_Trust");
      const dealerNet = calcNet("Dealer_Self") + calcNet("Dealer_Hedging");

      // Filter Margin Data
      const dayMargin = marginData.find(d => d.date === date);
      
      // Filter Price - Strict Number Checking
      const dayPrice = priceData.find(d => d.date === date);
      
      const close = dayPrice && !isNaN(Number(dayPrice.close)) ? Number(dayPrice.close) : 0;
      const open = dayPrice && !isNaN(Number(dayPrice.open)) ? Number(dayPrice.open) : 0;
      const high = dayPrice && !isNaN(Number(dayPrice.max)) ? Number(dayPrice.max) : 0;
      const low = dayPrice && !isNaN(Number(dayPrice.min)) ? Number(dayPrice.min) : 0;

      return {
        date,
        foreignBuy: foreignNet,
        investmentTrustBuy: trustNet,
        dealerBuy: dealerNet,
        marginBalance: dayMargin ? Number(dayMargin.MarginPurchaseTodayBalance || 0) : 0,
        shortBalance: dayMargin ? Number(dayMargin.ShortSaleTodayBalance || 0) : 0,
        price: close,
        open: open,
        high: high,
        low: low,
      };
    });

    // Filter out invalid data (where price is 0 or NaN) to prevent chart crashes
    const validData = combined.filter(d => d.price > 0 && !isNaN(d.price)).reverse(); 

    return validData;

  } catch (error) {
    console.error("Error fetching FinMind data:", error);
    return [];
  }
};