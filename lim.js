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
const DODO_ROUTER = '0x73CAfc894dBfC181398264934f7Be4e482fc9d40';
const LIQUIDITY_CONTRACT = '0x4b177aded3b8bd1d5d747f91b9e853513838cd49';
const DVM_POOL_ADDRESS = '0xff7129709ebd3485c4ed4fef6dd923025d24e730';
const TRADE_CONTRACT = "0xbf428011d76efbfaee35a20dd6a0ca589b539c54";
const SPENDER = "0xca20ee77031f5d024cfa142f5a30c82b9bad3d4a";

const PHRS_TO_USDT_AMOUNT = ethers.parseEther('0.00245');
const USDT_TO_PHRS_AMOUNT = ethers.parseUnits('1', 6);
const R2USD_TO_USDC_AMOUNT = ethers.parseUnits('1', 6);
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
    maxFeePerGas: (fee.maxFeePerGas * 130n) / 100n, // Bump sedikit lebih tinggi (130%)
    maxPriorityFeePerGas: (fee.maxPriorityFeePerGas * 130n) / 100n
  };
}

async function waitForTransaction(txResponse, walletAddress) {
  if (!txResponse) return null;
  try {
    const receipt = await txResponse.wait();
    return receipt;
  } catch (e) {
    if (e.code === 'TRANSACTION_REPLACED') return e.receipt;
    throw e;
  }
}

// Fixed Provider untuk Termux/V6
async function buildFallbackProvider(rpcUrls, chainId, name) {
  const network = ethers.Network.from({ chainId, name });
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], network, { 
    staticNetwork: network,
    batchMaxCount: 1 // Memaksa request satu per satu agar RPC tidak bingung
  });
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

// Penanganan BAD_DATA 0x dengan retry dan manual check
async function ensureAllowance(wallet, tokenAddr, spender, requiredAmount) {
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  let allowance;
  
  try {
    allowance = await contract.allowance(wallet.address, spender);
  } catch (e) {
    logger.warn(`RPC returned 0x for allowance. Attempting to force approve...`);
    allowance = 0n; // Asumsikan 0 jika RPC gagal kirim data
  }

  if (allowance >= requiredAmount) return true;

  logger.info(`Approving spender ${spender} for token ${tokenAddr}...`);
  try {
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await contract.approve(spender, ethers.MaxUint256, { ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    logger.success('Approval success!');
    await new Promise(r => setTimeout(r, 2000)); // Jeda agar RPC sinkron
    return true;
  } catch (err) {
    logger.error(`Approval failed: ${err.message}`);
    return false;
  }
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
    const ok = await ensureAllowance(wallet, TOKENS.USDT, SPENDER, required);
    if (!ok) return;

    const template = await fetchTemplate(side, provider);
    const amtHex = ethers.parseUnits(amountUSDT, 6).toString(16).padStart(64, "0");
    
    // Patch calldata manual
    const tokenPart = TOKENS.USDT.toLowerCase().replace("0x", "").padStart(64, "0");
    const data = template.replace(new RegExp(tokenPart, 'g'), tokenPart).replace(template.slice(-64), amtHex);

    const feeWithBump = await getFeeWithBump(provider);
    const tx = await wallet.sendTransaction({
      to: TRADE_CONTRACT,
      data: data,
      gasLimit: 800000,
      ...feeWithBump
    });
    await waitForTransaction(tx, wallet.address);
    logger.success(`${side.toUpperCase()} success!`);
  } catch (e) {
    logger.error(`${side.toUpperCase()} failed: ${e.message}`);
  }
}

// AquaFlux Login dengan Handling 502
async function executeAquaFluxFlow(wallet, proxyAgent) {
    logger.step("Starting AquaFlux flow...");
    try {
        const timestamp = Date.now();
        const message = `Sign in to AquaFlux with timestamp: ${timestamp}`;
        const signature = await wallet.signMessage(message);
        
        const loginRes = await axios.post('https://api.aquaflux.pro/api/v1/users/wallet-login', 
            { address: wallet.address, message, signature },
            { httpsAgent: proxyAgent, timeout: 15000 }
        ).catch(() => null);

        if (!loginRes) {
            logger.warn("AquaFlux API Down (502). Skipping...");
            return;
        }

        const accessToken = loginRes.data.data.accessToken;
        const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
        const fee = await getFeeWithBump(wallet.provider);
        
        logger.info("Claiming Aqua tokens...");
        const txClaim = await nftContract.claimTokens({ gasLimit: 300000, ...fee });
        await waitForTransaction(txClaim, wallet.address);
        logger.success("Claim OK");
    } catch (e) {
        logger.error(`AquaFlux failed: ${e.message}`);
    }
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

  const tradeC = await question("Trade count: ");
  const tradeA = await question("USDT amount: ");
  const mintC = await question("Run AquaFlux (1/0): ");
  rl.close();

  while (true) {
    for (const [i, pk] of privateKeys.entries()) {
      const wallet = new ethers.Wallet(pk, provider);
      const proxyAgent = getProxyAgent(proxies);
      logger.section(`Wallet ${i + 1}/${privateKeys.length}: ${wallet.address}`);
      
      for (let t = 0; t < parseInt(tradeC); t++) {
        await executeLongShort(wallet, provider, "long", tradeA);
        await new Promise(r => setTimeout(r, 3000)); // Jeda antar trade
        await executeLongShort(wallet, provider, "short", tradeA);
        await new Promise(r => setTimeout(r, 3000));
      }
      if (parseInt(mintC) > 0) await executeAquaFluxFlow(wallet, proxyAgent);
    }
    await showCountdown();
  }
})().catch(err => { logger.error(`Fatal: ${err.message}`); process.exit(1); });
