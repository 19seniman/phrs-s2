const axios = require('axios');
const ethers = require('ethers');
const dotenv = require('dotenv');
const readline = require('readline');
const fs = require('fs');
const { HttpsProxyAgent } = require('https-proxy-agent');

dotenv.config();

const ERC20_ABI = [
  "function balanceOf(address owner) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];
const LIQUIDITY_CONTRACT_ABI = [
  "function addDVMLiquidity(address dvmAddress,uint256 baseInAmount,uint256 quoteInAmount,uint256 baseMinAmount,uint256 quoteMinAmount,uint8 flag,uint256 deadLine)"
];
const PRIMUS_TIP_ABI = [
  "function tip((uint32,address) token,(string,string,uint256,uint256[]) recipient)"
];
const AQUAFLUX_NFT_ABI = [
  "function claimTokens()",
  "function mint(uint256 nftType,uint256 expiresAt,bytes signature)"
];

const PHAROS_CHAIN_ID = 688688;
const PHAROS_RPC_URLS = ['https://atlantic.dplabs-internal.com'];

const TOKENS = {
  PHRS: '0xEeeeeEeeeEeEeeEeEeEeeEEEeeeeEeeeeeeeEEeE',
  USDT: '0xD4071393f8716661958F766DF660033b3d35fD29',
  USDC_DODO: '0x72df0bcd7276f2dfbac900d1ce63c272c4bccced',
  USDC_R2USD: '0x8bebfcbe5468f146533c182df3dfbf5ff9be00e2',
  R2USD: '0x4f5b54d4af2568cefafa73bb062e5d734b55aa05'
};

const AQUAFLUX_NFT_CONTRACT = '0xcc8cf44e196cab28dba2d514dc7353af0efb370e';
const AQUAFLUX_TOKENS = {
  P: '0xb5d3ca5802453cc06199b9c40c855a874946a92c',
  C: '0x4374fbec42e0d46e66b379c0a6072c910ef10b32',
  S: '0x5df839de5e5a68ffe83b89d430dc45b1c5746851',
  CS: '0xceb29754c54b4bfbf83882cb0dcef727a259d60a'
};

const DODO_ROUTER = '0x73CAfc894dBfC181398264934f7Be4e482fc9d40';
const LIQUIDITY_CONTRACT = '0x4b177aded3b8bd1d5d747f91b9e853513838cd49';
const PRIMUS_TIP_CONTRACT = '0xd17512b7ec12880bd94eca9d774089ff89805f02';
const DVM_POOL_ADDRESS = '0xff7129709ebd3485c4ed4fef6dd923025d24e730';
const TRADE_CONTRACT = "0xbf428011d76efbfaee35a20dd6a0ca589b539c54";
const SPENDER = "0xca20ee77031f5d024cfa142f5a30c82b9bad3d4a";

const PHRS_TO_USDT_AMOUNT = ethers.parseEther('0.00245');
const USDT_TO_PHRS_AMOUNT = ethers.parseUnits('1', 6);
const PHRS_TO_USDC_AMOUNT = ethers.parseEther('0.00245');
const USDC_TO_PHRS_AMOUNT = ethers.parseUnits('1', 6);
const R2USD_TO_USDC_AMOUNT = ethers.parseUnits('1', 6);
const USDC_TO_R2USD_AMOUNT = ethers.parseUnits('1', 6);
const USDC_LIQUIDITY_AMOUNT = BigInt(10000);
const USDT_LIQUIDITY_AMOUNT = BigInt(30427);

const colors = {
    reset: "\x1b[0m", bold: "\x1b[1m", red: "\x1b[31m", green: "\x1b[32m",
    yellow: "\x1b[33m", blue: "\x1b[34m", magenta: "\x1b[35m", cyan: "\x1b[36m",
    white: "\x1b[37m", gray: "\x1b[90m",
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    banner: () => {
        console.log(`\n${colors.blue}${colors.bold}╔═════════════════════════════════════════╗`);
        console.log(`║   🍉 19Seniman From Insider    🍉    ║`);
        console.log(`╚═════════════════════════════════════════╝${colors.reset}\n`);
    },
    section: (msg) => {
        console.log(`\n${colors.gray}${'─'.repeat(40)}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${'─'.repeat(40)}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

async function getFeeWithBump(provider) {
  const fee = await provider.getFeeData();
  return {
    maxFeePerGas: (fee.maxFeePerGas * 120n) / 100n,
    maxPriorityFeePerGas: (fee.maxPriorityFeePerGas * 120n) / 100n
  };
}

async function waitForTransaction(txResponse, walletAddress) {
  if (!txResponse) return null;
  try {
    return await txResponse.wait();
  } catch (e) {
    if (e.code === 'TRANSACTION_REPLACED') return e.receipt;
    throw e;
  }
}

async function buildFallbackProvider(rpcUrls, chainId, name) {
  const network = ethers.Network.from({ chainId, name });
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], network, { staticNetwork: network });
  return { getProvider: async () => provider };
}

function loadPrivateKeys() {
  const keys = [];
  let i = 1;
  while (process.env[`PRIVATE_KEY_${i}`]) {
    const pk = process.env[`PRIVATE_KEY_${i}`];
    if (pk.startsWith("0x") && pk.length === 66) keys.push(pk);
    i++;
  }
  return keys;
}

function loadProxies() {
  try {
    const data = fs.readFileSync("proxies.txt", "utf8");
    return data.split("\n").map(p => p.trim()).filter(p => p);
  } catch { return []; }
}

function getProxyAgent(proxies) {
  return proxies.length ? new HttpsProxyAgent(proxies[Math.floor(Math.random() * proxies.length)]) : null;
}

function strip0x(h) { return (h || "").toLowerCase().replace(/^0x/, ""); }
function pad64(hexNo0x) { return hexNo0x.padStart(64, "0"); }
function encodeAmountHex(amountStr, decimals) {
  const amt = ethers.parseUnits(amountStr, decimals);
  return pad64(amt.toString(16));
}

function patchAmountInCalldata(calldataHex, tokenAddr, encodedAmount64) {
  const data = strip0x(calldataHex);
  const paddedToken = "000000000000000000000000" + strip0x(tokenAddr);
  const idx = data.indexOf(paddedToken);
  if (idx === -1) throw new Error("Token not found in calldata");
  return "0x" + data.slice(0, idx + paddedToken.length) + encodedAmount64 + data.slice(idx + paddedToken.length + 64);
}

async function ensureAllowance(wallet, tokenAddr, spender, requiredAmount) {
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const allowance = await contract.allowance(wallet.address, spender);
  if (allowance >= requiredAmount) return true;
  logger.info(`Approving spender ${spender} for token ${tokenAddr}`);
  const feeWithBump = await getFeeWithBump(wallet.provider);
  const tx = await contract.approve(spender, ethers.MaxUint256, feeWithBump);
  await waitForTransaction(tx, wallet.address);
  return true;
}

async function fetchTemplate(side, provider) {
  const txHash = side === "long"
    ? "0xd0e613ac6fe40fec837d44009b42ca251d520f8897ff65f3a955712373c59f77"
    : "0x50085e565522f1a623296b8efdc36eba9d51a4e3b05fb069f6c8155465a7d51a";
  const resp = await provider.send("eth_getTransactionByHash", [txHash]);
  return resp.input;
}

async function executeLongShort(wallet, provider, side, amountUSDT) {
  logger.step(`Executing ${side.toUpperCase()}...`);
  try {
    const required = ethers.parseUnits(amountUSDT, 6);
    await ensureAllowance(wallet, TOKENS.USDT, SPENDER, required);
    const template = await fetchTemplate(side, provider);
    const patchedData = patchAmountInCalldata(template, TOKENS.USDT, encodeAmountHex(amountUSDT, 6));
    const feeWithBump = await getFeeWithBump(provider);
    const tx = await wallet.sendTransaction({ to: TRADE_CONTRACT, data: patchedData, gasLimit: 600000, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    logger.success(`${side.toUpperCase()} success!`);
  } catch (e) { logger.error(`${side.toUpperCase()} failed: ${e.message}`); }
}

// --- AQUAFLUX WITH RETRY LOGIC ---
async function aquaFluxRequest(method, url, data, config, retries = 2) {
    for (let i = 0; i <= retries; i++) {
        try {
            return await axios({ method, url, data, ...config });
        } catch (e) {
            if (i === retries) throw e;
            logger.warn(`AquaFlux Server 502/Busy. Retrying in 5s... (${i+1}/${retries})`);
            await new Promise(r => setTimeout(r, 5000));
        }
    }
}

async function executeAquaFluxFlow(wallet, proxyAgent) {
    logger.step("Starting AquaFlux flow...");
    try {
        const timestamp = Date.now();
        const message = `Sign in to AquaFlux with timestamp: ${timestamp}`;
        const signature = await wallet.signMessage(message);
        
        const loginRes = await aquaFluxRequest('POST', 'https://api.aquaflux.pro/api/v1/users/wallet-login', {
            address: wallet.address, message, signature
        }, { httpsAgent: proxyAgent });

        const accessToken = loginRes.data.data.accessToken;
        logger.success('AquaFlux Login OK');

        await claimTokens(wallet);
        
        const sigRes = await aquaFluxRequest('POST', 'https://api.aquaflux.pro/api/v1/users/get-signature', {
            walletAddress: wallet.address, requestedNftType: 0
        }, { headers: { 'authorization': `Bearer ${accessToken}` }, httpsAgent: proxyAgent });

        await mintNFT(wallet, sigRes.data.data);
    } catch (e) {
        logger.error(`AquaFlux flow failed (Server might be down): ${e.message}`);
    }
}

async function claimTokens(wallet) {
  try {
    const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await nftContract.claimTokens({ gasLimit: 300000, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
  } catch (e) {}
}

async function mintNFT(wallet, signatureData) {
  try {
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const calldata = '0x75e7e053' + abiCoder.encode(['uint256', 'uint256', 'bytes'], [signatureData.nftType, signatureData.expiresAt, signatureData.signature]).substring(2);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await wallet.sendTransaction({ to: AQUAFLUX_NFT_CONTRACT, data: calldata, gasLimit: 400000, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    logger.success('NFT Minted!');
  } catch (e) { logger.error(`Mint Failed: ${e.message}`); }
}

async function fetchDodoRoute(fromAddr, toAddr, userAddr, amountWei, proxyAgent) {
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=${PHAROS_CHAIN_ID}&deadLine=${deadline}&apikey=a37546505892e1a952&slippage=3.225&source=dodoV2AndMixWasm&toTokenAddress=${toAddr}&fromTokenAddress=${fromAddr}&userAddr=${userAddr}&fromAmount=${amountWei}`;
  const res = await axios.get(url, { httpsAgent: proxyAgent });
  return res.data.data;
}

async function batchSwap(wallet, numberOfCycles, proxyAgent) {
  const swapPairs = [
    { from: TOKENS.PHRS, to: TOKENS.USDT, amount: PHRS_TO_USDT_AMOUNT, sym: 'PHRS>USDT' },
    { from: TOKENS.USDT, to: TOKENS.PHRS, amount: USDT_TO_PHRS_AMOUNT, sym: 'USDT>PHRS' }
  ];
  for (let i = 0; i < numberOfCycles; i++) {
    for (const p of swapPairs) {
      try {
        if (p.from !== TOKENS.PHRS) await ensureAllowance(wallet, p.from, DODO_ROUTER, p.amount);
        const route = await fetchDodoRoute(p.from, p.to, wallet.address, p.amount, proxyAgent);
        const feeWithBump = await getFeeWithBump(wallet.provider);
        const tx = await wallet.sendTransaction({ to: route.to, data: route.data, value: BigInt(route.value), gasLimit: 500000, ...feeWithBump });
        await waitForTransaction(tx, wallet.address);
        logger.success(`Swap ${p.sym} OK`);
      } catch (e) { logger.error(`Swap failed: ${e.message}`); }
    }
  }
}

async function addLiquidity(wallet) {
  try {
    await ensureAllowance(wallet, TOKENS.USDC_DODO, LIQUIDITY_CONTRACT, USDC_LIQUIDITY_AMOUNT);
    await ensureAllowance(wallet, TOKENS.USDT, LIQUIDITY_CONTRACT, USDT_LIQUIDITY_AMOUNT);
    const contract = new ethers.Contract(LIQUIDITY_CONTRACT, LIQUIDITY_CONTRACT_ABI, wallet);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await contract.addDVMLiquidity(DVM_POOL_ADDRESS, USDC_LIQUIDITY_AMOUNT, USDT_LIQUIDITY_AMOUNT, 0, 0, 0, Math.floor(Date.now()/1000)+600, feeWithBump);
    await waitForTransaction(tx, wallet.address);
    logger.success('Liquidity Added!');
  } catch (e) { logger.error(`Liquidity failed: ${e.message}`); }
}

async function showCountdown() {
  const tomorrow = new Date(); tomorrow.setHours(24, 0, 0, 0);
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const remaining = tomorrow - new Date();
      if (remaining <= 0) { clearInterval(interval); resolve(); }
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      logger.countdown(`Next cycle in ${h}h ${m}m ${s}s  `);
    }, 1000);
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(query) { return new Promise(resolve => rl.question(query, resolve)); }

(async () => {
  logger.banner();
  const provObj = await buildFallbackProvider(PHAROS_RPC_URLS, PHAROS_CHAIN_ID, "pharos");
  const provider = await provObj.getProvider();
  const privateKeys = loadPrivateKeys();
  const proxies = loadProxies();

  const swapC = await question("Swap cycles: ");
  const liqC = await question("Liquidity adds: ");
  const mintC = await question("AquaFlux mint (1/0): ");
  const tradeC = await question("Trade count: ");
  const tradeA = await question("USDT amount: ");
  rl.close();

  while (true) {
    for (const [i, pk] of privateKeys.entries()) {
      const wallet = new ethers.Wallet(pk, provider);
      const proxyAgent = getProxyAgent(proxies);
      logger.section(`Wallet ${i + 1}/${privateKeys.length}: ${wallet.address}`);
      
      for (let t = 0; t < parseInt(tradeC); t++) {
        await executeLongShort(wallet, provider, "long", tradeA);
        await executeLongShort(wallet, provider, "short", tradeA);
      }
      if (parseInt(mintC) > 0) await executeAquaFluxFlow(wallet, proxyAgent);
      if (parseInt(swapC) > 0) await batchSwap(wallet, parseInt(swapC), proxyAgent);
      if (parseInt(liqC) > 0) await addLiquidity(wallet);
    }
    await showCountdown();
  }
})().catch(err => { logger.error(`Fatal: ${err.message}`); process.exit(1); });
