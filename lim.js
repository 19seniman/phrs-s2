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
// Menggunakan RPC terbaru sesuai permintaan Anda
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
    reset: "\x1b[0m",
    bold: "\x1b[1m",
    red: "\x1b[31m",
    green: "\x1b[32m",
    yellow: "\x1b[33m",
    blue: "\x1b[34m",
    magenta: "\x1b[35m",
    cyan: "\x1b[36m",
    white: "\x1b[37m",
    gray: "\x1b[90m",
};

const logger = {
    info: (msg) => console.log(`${colors.cyan}[i] ${msg}${colors.reset}`),
    warn: (msg) => console.log(`${colors.yellow}[!] ${msg}${colors.reset}`),
    error: (msg) => console.log(`${colors.red}[x] ${msg}${colors.reset}`),
    success: (msg) => console.log(`${colors.green}[+] ${msg}${colors.reset}`),
    loading: (msg) => console.log(`${colors.magenta}[*] ${msg}${colors.reset}`),
    step: (msg) => console.log(`${colors.blue}[>] ${colors.bold}${msg}${colors.reset}`),
    critical: (msg) => console.log(`${colors.red}${colors.bold}[FATAL] ${msg}${colors.reset}`),
    summary: (msg) => console.log(`${colors.green}${colors.bold}[SUMMARY] ${msg}${colors.reset}`),
    banner: () => {
        const border = `${colors.blue}${colors.bold}╔═════════════════════════════════════════╗${colors.reset}`;
        const title = `${colors.blue}${colors.bold}║   🍉 19Seniman From Insider    🍉    ║${colors.reset}`;
        const bottomBorder = `${colors.blue}${colors.bold}╚═════════════════════════════════════════╝${colors.reset}`;
        
        console.log(`\n${border}`);
        console.log(`${title}`);
        console.log(`${bottomBorder}\n`);
    },
    section: (msg) => {
        const line = '─'.repeat(40);
        console.log(`\n${colors.gray}${line}${colors.reset}`);
        if (msg) console.log(`${colors.white}${colors.bold} ${msg} ${colors.reset}`);
        console.log(`${colors.gray}${line}${colors.reset}\n`);
    },
    countdown: (msg) => process.stdout.write(`\r${colors.blue}[⏰] ${msg}${colors.reset}`),
};

// --- TRANSACTION HELPER FUNCTIONS ---

async function getFeeWithBump(provider) {
  const fee = await provider.getFeeData();
  return {
    maxFeePerGas: (fee.maxFeePerGas * 120n) / 100n,
    maxPriorityFeePerGas: (fee.maxPriorityFeePerGas * 120n) / 100n
  };
}

async function waitForTransaction(txResponse, walletAddress) {
  if (!txResponse) {
    logger.warn(`Received an undefined transaction response for wallet ${walletAddress}. Skipping wait.`);
    return null;
  }
  try {
    return await txResponse.wait();
  } catch (e) {
    if (e.code === 'TRANSACTION_REPLACED') {
      logger.warn(`Transaction from ${walletAddress} with hash ${txResponse.hash} was replaced.`);
      if (e.receipt) {
        logger.info(`Replacement transaction successful with hash: ${e.receipt.hash}`);
        return e.receipt;
      }
      logger.warn('Could not find replacement receipt. The transaction may have been cancelled.');
      return null;
    }
    throw e;
  }
}

// Mengoptimalkan provider agar tidak gagal deteksi network di Termux
async function buildFallbackProvider(rpcUrls, chainId, name) {
  const network = ethers.Network.from({
    chainId: chainId,
    name: name
  });
  
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], network, {
    staticNetwork: network
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
  } catch {
    return [];
  }
}

function getProxyAgent(proxies) {
  return proxies.length ? new HttpsProxyAgent(proxies[Math.floor(Math.random() * proxies.length)]) : null;
}

function pad64(hexNo0x) { return hexNo0x.padStart(64, "0"); }
function strip0x(h) { return (h || "").toLowerCase().replace(/^0x/, ""); }
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
  logger.success('Approval successful.');
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
  logger.step(`Executing ${side.toUpperCase()} with ${amountUSDT} USDT...`);
  const required = ethers.parseUnits(amountUSDT, 6);
  await ensureAllowance(wallet, TOKENS.USDT, SPENDER, required);
  const template = await fetchTemplate(side, provider);
  const encodedAmt = encodeAmountHex(amountUSDT, 6);
  const patchedData = patchAmountInCalldata(template, TOKENS.USDT, encodedAmt);
  const feeWithBump = await getFeeWithBump(provider);
  
  let gas;
  try {
    gas = await provider.estimateGas({ from: wallet.address, to: TRADE_CONTRACT, data: patchedData });
  } catch (e) {
    logger.warn(`Gas estimation failed for ${side.toUpperCase()} trade. Using a fallback limit.`);
    gas = 500000n; 
  }

  const tx = await wallet.sendTransaction({
    chainId: PHAROS_CHAIN_ID,
    to: TRADE_CONTRACT,
    data: patchedData,
    gasLimit: gas,
    maxFeePerGas: feeWithBump.maxFeePerGas,
    maxPriorityFeePerGas: feeWithBump.maxPriorityFeePerGas
  });
  logger.info(`Trade transaction sent: ${tx.hash}`);
  const receipt = await waitForTransaction(tx, wallet.address);

  if (!receipt || receipt.status === 0) {
      throw new Error("Transaction failed on-chain");
  }

  logger.success(`${side.toUpperCase()} successful!`);
}

async function aquaFluxLogin(wallet, proxyAgent) {
  try {
    logger.info("Attempting AquaFlux login...");
    const timestamp = Date.now();
    const message = `Sign in to AquaFlux with timestamp: ${timestamp}`;
    const signature = await wallet.signMessage(message);
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/wallet-login', {
      address: wallet.address,
      message: message,
      signature: signature
    }, {
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/91.0.4472.124 Safari/537.36'
      },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      logger.success('AquaFlux login successful!');
      return response.data.data.accessToken;
    } else {
      throw new Error('Login failed');
    }
  } catch (e) {
    logger.error(`AquaFlux login failed: ${e.message}`);
    throw e;
  }
}

async function checkTokenHolding(accessToken, proxyAgent) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/check-token-holding', null, {
      headers: { 'authorization': `Bearer ${accessToken}` },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      return response.data.data.isHoldingToken;
    }
    return false;
  } catch (e) {
    logger.error(`Check token holding failed: ${e.message}`);
    return false;
  }
}

async function getSignature(wallet, accessToken, proxyAgent, nftType = 0) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/get-signature', {
      walletAddress: wallet.address,
      requestedNftType: nftType
    }, {
      headers: { 'authorization': `Bearer ${accessToken}` },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      return response.data.data;
    }
    throw new Error('Get signature failed');
  } catch (e) {
    logger.error(`Get signature failed: ${e.message}`);
    throw e;
  }
}

async function mintNFT(wallet, signatureData) {
  logger.info('Minting AquaFlux NFT...');
  try {
    const nftType = signatureData.nftType;
    const expiresAt = signatureData.expiresAt;
    const signature = signatureData.signature;
    
    const CORRECT_METHOD_ID = '0x75e7e053';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(['uint256', 'uint256', 'bytes'], [nftType, expiresAt, signature]);
    const calldata = CORRECT_METHOD_ID + encodedParams.substring(2);
    
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await wallet.sendTransaction({
      to: AQUAFLUX_NFT_CONTRACT,
      data: calldata,
      gasLimit: 400000,
      ...feeWithBump
    });
    await waitForTransaction(tx, wallet.address);
    logger.success('NFT minted successfully!');
  } catch (e) {
    logger.error(`NFT mint failed: ${e.message}`);
    throw e;
  }
}

async function executeAquaFluxFlow(wallet, proxyAgent) {
    logger.step("Starting AquaFlux flow...");
  try {
    const accessToken = await aquaFluxLogin(wallet, proxyAgent);
    await claimTokens(wallet);
    await craftTokens(wallet);
    await checkTokenHolding(accessToken, proxyAgent);
    const signatureData = await getSignature(wallet, accessToken, proxyAgent);
    await mintNFT(wallet, signatureData);
    return true;
  } catch (e) {
    return false;
  }
}

async function fetchDodoRoute(fromAddr, toAddr, userAddr, amountWei, proxyAgent) {
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=${PHAROS_CHAIN_ID}&deadLine=${deadline}&apikey=a37546505892e1a952&slippage=3.225&source=dodoV2AndMixWasm&toTokenAddress=${toAddr}&fromTokenAddress=${fromAddr}&userAddr=${userAddr}&estimateGas=true&fromAmount=${amountWei}`;
  const res = await axios.get(url, { httpsAgent: proxyAgent });
  return res.data.data;
}

async function approveToken(wallet, tokenAddr, tokenSymbol, amount, spender, decimals = 18) {
  if (tokenAddr === TOKENS.PHRS) return true;
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  const allowance = await contract.allowance(wallet.address, spender);
  if (allowance >= amount) return true;
  const feeWithBump = await getFeeWithBump(wallet.provider);
  const tx = await contract.approve(spender, amount, feeWithBump);
  await waitForTransaction(tx, wallet.address);
  return true;
}

async function executeSwap(wallet, routeData, fromAddr, fromSymbol, amount, decimals) {
  if (fromAddr !== TOKENS.PHRS) {
    await approveToken(wallet, fromAddr, fromSymbol, amount, DODO_ROUTER, decimals);
  }
  const feeWithBump = await getFeeWithBump(wallet.provider);
  const tx = await wallet.sendTransaction({
    to: routeData.to,
    data: routeData.data,
    value: BigInt(routeData.value),
    gasLimit: BigInt(routeData.gasLimit || 500000),
    ...feeWithBump
  });
  await waitForTransaction(tx, wallet.address);
  logger.success('Swap confirmed!');
}

async function swapR2USDToUSDC(wallet, amount) {
  const burnIface = new ethers.Interface(["function burn(address _from, uint256 _amount)"]);
  const data = burnIface.encodeFunctionData("burn", [wallet.address, amount]);
  const feeWithBump = await getFeeWithBump(wallet.provider);
  const tx = await wallet.sendTransaction({ to: TOKENS.R2USD, data, gasLimit: 250000, ...feeWithBump });
  await waitForTransaction(tx, wallet.address);
}

async function swapUSDCToR2USD(wallet, amount) {
  await approveToken(wallet, TOKENS.USDC_R2USD, 'USDC', amount, TOKENS.R2USD, 6);
  const mintIface = new ethers.Interface(["function mint(address _to, uint256 _amount)"]);
  const mintData = mintIface.encodeFunctionData("mint", [wallet.address, amount]);
  const feeWithBump = await getFeeWithBump(wallet.provider);
  const tx = await wallet.sendTransaction({ to: TOKENS.R2USD, data: mintData, gasLimit: 300000, ...feeWithBump });
  await waitForTransaction(tx, wallet.address);
}

async function batchSwap(wallet, numberOfCycles, proxyAgent) {
  const swapPairs = [
    { from: TOKENS.PHRS, to: TOKENS.USDT, amount: PHRS_TO_USDT_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDT', decimals: 18 },
    { from: TOKENS.USDT, to: TOKENS.PHRS, amount: USDT_TO_PHRS_AMOUNT, fromSymbol: 'USDT', toSymbol: 'PHRS', decimals: 6 },
    { from: TOKENS.PHRS, to: TOKENS.USDC_DODO, amount: PHRS_TO_USDC_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDC', decimals: 18 },
    { from: TOKENS.USDC_DODO, to: TOKENS.PHRS, amount: USDC_TO_PHRS_AMOUNT, fromSymbol: 'USDC', toSymbol: 'PHRS', decimals: 6 },
    { from: TOKENS.R2USD, to: TOKENS.USDC_R2USD, amount: R2USD_TO_USDC_AMOUNT, fromSymbol: 'R2USD', toSymbol: 'USDC', decimals: 6 },
    { from: TOKENS.USDC_R2USD, to: TOKENS.R2USD, amount: USDC_TO_R2USD_AMOUNT, fromSymbol: 'USDC', toSymbol: 'R2USD', decimals: 6 }
  ];
  for (let i = 0; i < numberOfCycles; i++) {
    for (const p of swapPairs) {
      try {
        if (p.fromSymbol === "R2USD") await swapR2USDToUSDC(wallet, p.amount);
        else if (p.toSymbol === "R2USD") await swapUSDCToR2USD(wallet, p.amount);
        else {
          const route = await fetchDodoRoute(p.from, p.to, wallet.address, p.amount, proxyAgent);
          await executeSwap(wallet, route, p.from, p.fromSymbol, p.amount, p.decimals);
        }
      } catch (e) { logger.error(`Swap failed: ${e.message}`); }
      await new Promise(r => setTimeout(r, 2000));
    }
  }
}

async function addLiquidity(wallet) {
  logger.step('Adding Liquidity...');
  try {
    await approveToken(wallet, TOKENS.USDC_DODO, 'USDC', USDC_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
    await approveToken(wallet, TOKENS.USDT, 'USDT', USDT_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
    const contract = new ethers.Contract(LIQUIDITY_CONTRACT, LIQUIDITY_CONTRACT_ABI, wallet);
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await contract.addDVMLiquidity(DVM_POOL_ADDRESS, USDC_LIQUIDITY_AMOUNT, USDT_LIQUIDITY_AMOUNT, 0, 0, 0, deadline, feeWithBump);
    await waitForTransaction(tx, wallet.address);
    logger.success('Liquidity added!');
  } catch (e) { logger.error(`Add Liquidity failed: ${e.message}`); }
}

async function sendTip(wallet, username) {
  try {
    const amount = ethers.parseEther('0.0000001');
    const contract = new ethers.Contract(PRIMUS_TIP_CONTRACT, PRIMUS_TIP_ABI, wallet);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await contract.tip([1, TOKENS.PHRS], ['x', username, amount, []], { value: amount, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    logger.success(`Tipped ${username}`);
  } catch (e) { logger.error(`Tip failed: ${e.message}`); }
}

async function claimTokens(wallet) {
  try {
    const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await nftContract.claimTokens({ gasLimit: 300000, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    return true;
  } catch (e) { return true; }
}

async function craftTokens(wallet) {
  try {
    const required = ethers.parseUnits('100', 18);
    await approveToken(wallet, AQUAFLUX_TOKENS.C, 'C', required, AQUAFLUX_NFT_CONTRACT);
    await approveToken(wallet, AQUAFLUX_TOKENS.S, 'S', required, AQUAFLUX_NFT_CONTRACT);
    const CRAFT_METHOD_ID = '0x4c10b523';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const calldata = CRAFT_METHOD_ID + abiCoder.encode(['uint256'], [required]).substring(2);
    const feeWithBump = await getFeeWithBump(wallet.provider);
    const tx = await wallet.sendTransaction({ to: AQUAFLUX_NFT_CONTRACT, data: calldata, gasLimit: 300000, ...feeWithBump });
    await waitForTransaction(tx, wallet.address);
    return true;
  } catch (e) { throw e; }
}

async function showCountdown() {
  const tomorrow = new Date();
  tomorrow.setHours(24, 0, 0, 0);
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const remaining = tomorrow - new Date();
      const h = Math.floor(remaining / 3600000);
      const m = Math.floor((remaining % 3600000) / 60000);
      const s = Math.floor((remaining % 60000) / 1000);
      logger.countdown(`Next cycle in ${h}h ${m}m ${s}s`);
      if (remaining <= 0) { clearInterval(interval); resolve(); }
    }, 1000);
  });
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(query) { return new Promise(resolve => rl.question(query, resolve)); }

(async () => {
  logger.banner();
  // Provider yang lebih tahan banting terhadap error network
  const provObj = await buildFallbackProvider(PHAROS_RPC_URLS, PHAROS_CHAIN_ID, "pharos");
  const provider = await provObj.getProvider();
  
  const privateKeys = loadPrivateKeys();
  const proxies = loadProxies();
  if (!privateKeys.length) process.exit(1);

  const swapCycleStr = await question("Daily swap cycles: ");
  const liqCountStr = await question("Liquidity adds: ");
  const mintStr = await question("AquaFlux mints: ");
  const username = await question("X username to tip: ");
  const tipCountStr = await question("Tips count: ");
  const tradeCountStr = await question("Long/Short count: ");
  const tradeAmount = await question("USDT per trade: ");
  rl.close();

  while (true) {
    for (const [i, pk] of privateKeys.entries()) {
      const wallet = new ethers.Wallet(pk, provider);
      const proxyAgent = getProxyAgent(proxies);
      logger.section(`Wallet ${i + 1}/${privateKeys.length}: ${wallet.address}`);
      
      for (let t = 0; t < parseInt(tradeCountStr); t++) {
        try { await executeLongShort(wallet, provider, "long", tradeAmount); } catch (e) {}
        try { await executeLongShort(wallet, provider, "short", tradeAmount); } catch (e) {}
      }
      if (parseInt(mintStr) > 0) await executeAquaFluxFlow(wallet, proxyAgent);
      if (parseInt(swapCycleStr) > 0) await batchSwap(wallet, parseInt(swapCycleStr), proxyAgent);
      if (parseInt(liqCountStr) > 0) await addLiquidity(wallet);
      if (username && parseInt(tipCountStr) > 0) {
        for (let t = 0; t < parseInt(tipCountStr); t++) await sendTip(wallet, username);
      }
    }
    await showCountdown();
  }
})().catch(err => {
  logger.critical(`Fatal: ${err.message}`);
  process.exit(1);
});
