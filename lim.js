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
const PHAROS_RPC_URLS = ['https://testnet.dplabs-internal.com'];

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
// --- END OF NEW LOGGER IMPLEMENTATION ---


async function buildFallbackProvider(rpcUrls, chainId, name) {
  const provider = new ethers.JsonRpcProvider(rpcUrls[0], { chainId, name });
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
  const tx = await contract.approve(spender, ethers.MaxUint256);
  await tx.wait();
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
  const fee = await provider.getFeeData();
  const gas = await provider.estimateGas({ from: wallet.address, to: TRADE_CONTRACT, data: patchedData });
  const tx = await wallet.sendTransaction({
    chainId: PHAROS_CHAIN_ID,
    to: TRADE_CONTRACT,
    data: patchedData,
    gasLimit: gas,
    maxFeePerGas: fee.maxFeePerGas,
    maxPriorityFeePerGas: fee.maxPriorityFeePerGas
  });
  logger.info(`Trade transaction sent: ${tx.hash}`);
  await tx.wait();
  logger.success(`${side.toUpperCase()} successful!`);
}

const USER_AGENTS = [
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.101 Safari/537.36'
];
function getRandomUserAgent() {
  return USER_AGENTS[Math.floor(Math.random() * USER_AGENTS.length)];
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
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'content-type': 'application/json',
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      logger.success('AquaFlux login successful!');
      return response.data.data.accessToken;
    } else {
      throw new Error('Login failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`AquaFlux login failed: ${e.message}`);
    throw e;
  }
}

async function checkTokenHolding(accessToken, proxyAgent) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/check-token-holding', null, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'authorization': `Bearer ${accessToken}`,
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      const isHolding = response.data.data.isHoldingToken;
      logger.success(`API Token holding check: ${isHolding ? 'YES' : 'NO'}`);
      return isHolding;
    } else {
      throw new Error('Check holding failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`Check token holding failed: ${e.message}`);
    throw e;
  }
}

async function getSignature(wallet, accessToken, proxyAgent, nftType = 0) {
  try {
    const response = await axios.post('https://api.aquaflux.pro/api/v1/users/get-signature', {
      walletAddress: wallet.address,
      requestedNftType: nftType
    }, {
      headers: {
        'accept': 'application/json, text/plain, */*',
        'accept-language': 'en-US,en;q=0.5',
        'authorization': `Bearer ${accessToken}`,
        'content-type': 'application/json',
        'user-agent': getRandomUserAgent()
      },
      httpsAgent: proxyAgent
    });
    if (response.data.status === 'success') {
      logger.success('Signature obtained successfully!');
      return response.data.data;
    } else {
      throw new Error('Get signature failed: ' + JSON.stringify(response.data));
    }
  } catch (e) {
    logger.error(`Get signature failed: ${e.message}`);
    throw e;
  }
}

async function mintNFT(wallet, signatureData) {
  logger.info('Minting AquaFlux NFT...');
  try {
    const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);
    const requiredAmount = ethers.parseUnits('100', 18);
    const csBalance = await csTokenContract.balanceOf(wallet.address);
    if (csBalance < requiredAmount) {
      throw new Error(`Insufficient CS tokens. Required: 100, Available: ${ethers.formatUnits(csBalance, 18)}`);
    }
    const allowance = await csTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if (allowance < requiredAmount) {
      const approvalTx = await csTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
      await approvalTx.wait();
    }
    const currentTime = Math.floor(Date.now() / 1000);
    if (currentTime >= signatureData.expiresAt) {
      throw new Error(`Signature is already expired! Check your system's clock.`);
    }
    const CORRECT_METHOD_ID = '0x75e7e053';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(
      ['uint256', 'uint256', 'bytes'],
      [signatureData.nftType, signatureData.expiresAt, signatureData.signature]
    );
    const calldata = CORRECT_METHOD_ID + encodedParams.substring(2);
    const tx = await wallet.sendTransaction({
      to: AQUAFLUX_NFT_CONTRACT,
      data: calldata,
      gasLimit: 400000
    });
    logger.info(`NFT mint transaction sent! TX Hash: ${tx.hash}`);
    const receipt = await tx.wait();
    if (receipt.status === 0) {
      throw new Error('Transaction reverted on-chain. Check the transaction on a block explorer.');
    }
    logger.success('NFT minted successfully!');
    return true;
  } catch (e) {
    logger.error(`NFT mint failed: ${e.reason || e.message}`);
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
    logger.success('AquaFlux flow completed successfully!');
    return true;
  } catch (e) {
    logger.error(`AquaFlux flow failed: ${e.message}`);
    return false;
  }
}

async function fetchWithTimeout(url, options, timeout = 15000) {
  try {
    const source = axios.CancelToken.source();
    const timeoutId = setTimeout(() => source.cancel('Timeout'), timeout);
    const res = await axios({
      method: options.method,
      url: url,
      headers: options.headers,
      data: options.body,
      cancelToken: source.token,
      httpsAgent: options.httpsAgent
    });
    clearTimeout(timeoutId);
    return res;
  } catch (err) {
    if (axios.isCancel(err)) throw new Error('Request timed out');
    throw new Error(`Network or API error: ${err.message}`);
  }
}
async function robustFetchDodoRoute(url, proxyAgent) {
  for (let i = 0; i < 5; i++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'GET', httpsAgent: proxyAgent });
      const data = res.data;
      if (data.status !== -1) return data;
      logger.warn(`Retry ${i + 1} DODO API status -1`);
    } catch (e) {
      logger.warn(`Retry ${i + 1} failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 2000));
  }
  throw new Error('DODO API permanently failed');
}
async function fetchDodoRoute(fromAddr, toAddr, userAddr, amountWei, proxyAgent) {
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const url = `https://api.dodoex.io/route-service/v2/widget/getdodoroute?chainId=${PHAROS_CHAIN_ID}&deadLine=${deadline}&apikey=a37546505892e1a952&slippage=3.225&source=dodoV2AndMixWasm&toTokenAddress=${toAddr}&fromTokenAddress=${fromAddr}&userAddr=${userAddr}&estimateGas=true&fromAmount=${amountWei}`;
  try {
    const result = await robustFetchDodoRoute(url, proxyAgent);
    if (!result.data || !result.data.data) {
      throw new Error('Invalid DODO API response: missing data field');
    }
    logger.info('DODO Route Info fetched successfully');
    return result.data;
  } catch (err) {
    logger.error(`DODO API fetch failed: ${err.message}`);
    throw err;
  }
}
async function approveToken(wallet, tokenAddr, tokenSymbol, amount, spender, decimals = 18) {
  if (tokenAddr === TOKENS.PHRS) return true;
  const contract = new ethers.Contract(tokenAddr, ERC20_ABI, wallet);
  try {
    const balance = await contract.balanceOf(wallet.address);
    if (balance < amount) {
      logger.error(`Insufficient ${tokenSymbol} balance: ${ethers.formatUnits(balance, decimals)} ${tokenSymbol}`);
      return false;
    }
    const allowance = await contract.allowance(wallet.address, spender);
    if (allowance >= amount) {
      logger.info(`${tokenSymbol} already approved for ${spender}`);
      return true;
    }
    logger.info(`Approving ${ethers.formatUnits(amount, decimals)} ${tokenSymbol} for spender ${spender}`);
    const tx = await contract.approve(spender, amount);
    logger.info(`Approval TX sent: ${tx.hash}`);
    await tx.wait();
    logger.success('Approval confirmed');
    return true;
  } catch (e) {
    logger.error(`Approval for ${tokenSymbol} failed: ${e.message}`);
    return false;
  }
}
async function executeSwap(wallet, routeData, fromAddr, fromSymbol, amount, decimals) {
  if (fromAddr !== TOKENS.PHRS) {
    const approved = await approveToken(wallet, fromAddr, fromSymbol, amount, DODO_ROUTER, decimals);
    if (!approved) throw new Error(`Token approval for ${fromSymbol} failed`);
  }
  try {
    if (!routeData.data || routeData.data === '0x') {
      throw new Error('Invalid transaction data from DODO API');
    }
    const tx = await wallet.sendTransaction({
      to: routeData.to,
      data: routeData.data,
      value: BigInt(routeData.value),
      gasLimit: BigInt(routeData.gasLimit || 500000)
    });
    logger.info(`Swap Transaction sent! TX Hash: ${tx.hash}`);
    await tx.wait();
    logger.success('Transaction confirmed!');
  } catch (e) {
    logger.error(`Swap TX failed: ${e.message}`);
    throw e;
  }
}

const R2USD_095E7A95_TEMPLATE_TX =
  '0xbfd418ae9361588d1ea306f3ef15d1565d81b21b58e1b2c667b4b14335aa0408';
const R2USD_095E7A95_TEMPLATE_FALLBACK =
  '0x095e7a95' +
  '0000000000000000000000004cbb1421df1cf362dc618d887056802d8adb7bc0' +
  '00000000000000000000000000000000000000000000000000000000000f4240' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000' +
  '0000000000000000000000000000000000000000000000000000000000000000';
function _pad32Addr(addr) {
  return '000000000000000000000000' + addr.toLowerCase().replace(/^0x/, '');
}
function _pad32Uint(bn) {
  return bn.toString(16).padStart(64, '0');
}
function _patch095eTemplate(templateHex, toAddr, amount) {
  const hex = templateHex.toLowerCase().replace(/^0x/, '');
  if (!hex.startsWith('095e7a95')) throw new Error('Unexpected template selector (expected 0x095e7a95)');
  const head = '095e7a95';
  const addrWord = _pad32Addr(toAddr);
  const amtWord = _pad32Uint(amount);
  const start = 8;
  const afterTwoWords = start + 64 + 64;
  return '0x' + head + addrWord + amtWord + hex.slice(afterTwoWords);
}
async function _fetchR2usd095eTemplate(provider) {
  try {
    const tx = await provider.send('eth_getTransactionByHash', [R2USD_095E7A95_TEMPLATE_TX]);
    if (tx && tx.input && tx.input.startsWith('0x095e7a95')) return tx.input;
  } catch (_) {}
  return R2USD_095E7A95_TEMPLATE_FALLBACK;
}

async function swapR2USDToUSDC(wallet, amount) {
  logger.step(`Swapping ${ethers.formatUnits(amount, 6)} R2USD -> USDC...`);
  try {
    const burnIface = new ethers.Interface([
      "function burn(address _from, uint256 _amount)"
    ]);
    const data = burnIface.encodeFunctionData("burn", [wallet.address, amount]);
    const tx = await wallet.sendTransaction({
      to: TOKENS.R2USD,
      data,
      gasLimit: 250000
    });
    logger.info(`Swap TX sent: ${tx.hash}`);
    const rc = await tx.wait();
    if (rc.status === 0) throw new Error('R2USD burn reverted');
    logger.success("R2USD -> USDC swap confirmed!");
  } catch (e) {
    logger.error(`R2USD->USDC swap failed: ${e.message}`);
    throw e;
  }
}

async function swapUSDCToR2USD(wallet, amount) {
  logger.step(`Swapping ${ethers.formatUnits(amount, 6)} USDC -> R2USD...`);
  try {
    const ok = await approveToken(wallet, TOKENS.USDC_R2USD, 'USDC', amount, TOKENS.R2USD, 6);
    if (!ok) throw new Error('USDC approval to R2USD failed');
    try {
      const template = await _fetchR2usd095eTemplate(wallet.provider);
      const data = _patch095eTemplate(template, wallet.address, amount);
      const tx = await wallet.sendTransaction({
        to: TOKENS.R2USD,
        data,
        gasLimit: 140000
      });
      logger.info(`Swap TX (0x095e7a95 templated) sent: ${tx.hash}`);
      const rc = await tx.wait();
      if (rc.status === 0) throw new Error('0x095e7a95 templated path reverted');
      logger.success("USDC -> R2USD swap confirmed via 0x095e7a95 template!");
      return;
    } catch (inner) {
      logger.warn(`0x095e7a95 template path failed: ${inner.message}`);
    }
    const mintIface = new ethers.Interface([
      "function mint(address _to, uint256 _amount)"
    ]);
    const mintData = mintIface.encodeFunctionData("mint", [wallet.address, amount]);
    const tx2 = await wallet.sendTransaction({
      to: TOKENS.R2USD,
      data: mintData,
      gasLimit: 300000
    });
    logger.info(`Swap TX (mint) sent: ${tx2.hash}`);
    const rc2 = await tx2.wait();
    if (rc2.status === 0) throw new Error('mint fallback reverted');
    logger.success("USDC -> R2USD swap confirmed via mint!");
  } catch (e) {
    logger.error(`USDC->R2USD swap failed: ${e.message}`);
    throw e;
  }
}

async function batchSwap(wallet, numberOfCycles, proxyAgent) {
  logger.step(`Preparing ${numberOfCycles} swap cycles (${numberOfCycles * 6} total swaps)...`);
  const swaps = [];
  const swapPairs = [
    { from: TOKENS.PHRS, to: TOKENS.USDT, amount: PHRS_TO_USDT_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDT', decimals: 18 },
    { from: TOKENS.USDT, to: TOKENS.PHRS, amount: USDT_TO_PHRS_AMOUNT, fromSymbol: 'USDT', toSymbol: 'PHRS', decimals: 6 },
    { from: TOKENS.PHRS, to: TOKENS.USDC_DODO, amount: PHRS_TO_USDC_AMOUNT, fromSymbol: 'PHRS', toSymbol: 'USDC', decimals: 18 },
    { from: TOKENS.USDC_DODO, to: TOKENS.PHRS, amount: USDC_TO_PHRS_AMOUNT, fromSymbol: 'USDC', toSymbol: 'PHRS', decimals: 6 },
    { from: TOKENS.R2USD, to: TOKENS.USDC_R2USD, amount: R2USD_TO_USDC_AMOUNT, fromSymbol: 'R2USD', toSymbol: 'USDC', decimals: 6 },
    { from: TOKENS.USDC_R2USD, to: TOKENS.R2USD, amount: USDC_TO_R2USD_AMOUNT, fromSymbol: 'USDC', toSymbol: 'R2USD', decimals: 6 }
  ];
  for (let i = 0; i < numberOfCycles; i++) swaps.push(...swapPairs);
  for (let i = 0; i < swaps.length; i++) {
    const { from, to, amount, fromSymbol, toSymbol, decimals } = swaps[i];
    const pair = `${fromSymbol} -> ${toSymbol}`;
    logger.step(`Executing Swap #${i + 1} of ${swaps.length}: ${pair}`);
    try {
      if (fromSymbol === "R2USD" && toSymbol === "USDC") {
        await swapR2USDToUSDC(wallet, amount);
      } else if (fromSymbol === "USDC" && toSymbol === "R2USD") {
        await swapUSDCToR2USD(wallet, amount);
      } else {
        const data = await fetchDodoRoute(from, to, wallet.address, amount, proxyAgent);
        await executeSwap(wallet, data, from, fromSymbol, amount, decimals);
      }
    } catch (e) {
      logger.error(`Swap #${i + 1} failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1800));
  }
}

async function addLiquidity(wallet) {
  logger.step('Starting "Add Liquidity" process...');
  try {
    logger.info('Checking USDC approval...');
    const usdcApproved = await approveToken(wallet, TOKENS.USDC_DODO, 'USDC', USDC_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
    if (!usdcApproved) throw new Error('USDC approval failed. Aborting.');
    logger.info('Checking USDT approval...');
    const usdtApproved = await approveToken(wallet, TOKENS.USDT, 'USDT', USDT_LIQUIDITY_AMOUNT, LIQUIDITY_CONTRACT, 6);
    if (!usdtApproved) throw new Error('USDT approval failed. Aborting.');
    logger.step('Approvals successful. Preparing to add liquidity...');
    const liquidityContract = new ethers.Contract(LIQUIDITY_CONTRACT, LIQUIDITY_CONTRACT_ABI, wallet);
    const dvmAddress = DVM_POOL_ADDRESS;
    const baseInAmount = BigInt(USDC_LIQUIDITY_AMOUNT);
    const quoteInAmount = BigInt(USDT_LIQUIDITY_AMOUNT);
    const baseMinAmount = baseInAmount * BigInt(999) / BigInt(1000);
    const quoteMinAmount = quoteInAmount * BigInt(999) / BigInt(1000);
    const flag = 0;
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const tx = await liquidityContract.addDVMLiquidity(
      dvmAddress, baseInAmount, quoteInAmount, baseMinAmount, quoteMinAmount, flag, deadline
    );
    logger.success(`Add Liquidity transaction sent! TX Hash: ${tx.hash}`);
    await tx.wait();
    logger.success('Transaction confirmed! Liquidity added successfully.');
  } catch (e) {
    logger.error(`Add Liquidity failed: ${e.message}`);
    throw e;
  }
}

async function sendTip(wallet, username) {
  logger.step('Starting "Send Tip" process...');
  try {
    const minAmount = ethers.parseEther('0.0000001');
    const maxAmount = ethers.parseEther('0.00000015');
    const randomAmount = minAmount + BigInt(Math.floor(Math.random() * Number(maxAmount - minAmount + BigInt(1))));
    const amountStr = ethers.formatEther(randomAmount);
    logger.step(`Preparing to tip ${amountStr} PHRS to ${username} on X...`);
    const tipContract = new ethers.Contract(PRIMUS_TIP_CONTRACT, PRIMUS_TIP_ABI, wallet);
    const tokenStruct = [1, '0x0000000000000000000000000000000000000000'];
    const recipientStruct = ['x', username, randomAmount, []];
    const tx = await tipContract.tip(tokenStruct, recipientStruct, { value: randomAmount });
    logger.success(`Tip transaction sent! TX Hash: ${tx.hash}`);
    await tx.wait();
    logger.success(`Successfully tipped ${amountStr} PHRS to ${username}!`);
  } catch (e) {
    logger.error(`Send Tip failed: ${e.message}`);
    throw e;
  }
}

async function showCountdown() {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);
  return new Promise(resolve => {
    const interval = setInterval(() => {
      const remaining = tomorrow - new Date();
      const hours = Math.floor(remaining / (1000 * 60 * 60));
      const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((remaining % (1000 * 60)) / 1000);
      logger.countdown(`Next cycle in ${hours}h ${minutes}m ${seconds}s`);
      if (remaining <= 0) {
        clearInterval(interval);
        process.stdout.write('\n');
        resolve();
      }
    }, 1000);
  });
}

async function claimTokens(wallet) {
  logger.step('Claiming free AquaFlux tokens (C & S)...');
  try {
    const nftContract = new ethers.Contract(AQUAFLUX_NFT_CONTRACT, AQUAFLUX_NFT_ABI, wallet);
    const tx = await nftContract.claimTokens({ gasLimit: 300000 });
    logger.success(`Claim tokens transaction sent! TX Hash: ${tx.hash}`);
    await tx.wait();
    logger.success('Tokens claimed successfully!');
    return true;
  } catch (e) {
    if ((e.message || '').toLowerCase().includes('already claimed')) {
      logger.warn('Tokens have already been claimed for today.');
      return true;
    }
    logger.error(`Claim tokens failed: ${e.message}`);
    throw e;
  }
}

async function craftTokens(wallet) {
  logger.step('Crafting 100 CS tokens from C and S tokens...');
  try {
    const cTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.C, ERC20_ABI, wallet);
    const sTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.S, ERC20_ABI, wallet);
    const csTokenContract = new ethers.Contract(AQUAFLUX_TOKENS.CS, ERC20_ABI, wallet);
    const requiredAmount = ethers.parseUnits('100', 18);
    const cBalance = await cTokenContract.balanceOf(wallet.address);
    if (cBalance < requiredAmount) {
      throw new Error(`Insufficient C tokens. Required: 100, Available: ${ethers.formatUnits(cBalance, 18)}`);
    }
    const sBalance = await sTokenContract.balanceOf(wallet.address);
    if (sBalance < requiredAmount) {
      throw new Error(`Insufficient S tokens. Required: 100, Available: ${ethers.formatUnits(sBalance, 18)}`);
    }
    const cAllowance = await cTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if (cAllowance < requiredAmount) {
      logger.step('Approving C tokens...');
      const cApproveTx = await cTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
      await cApproveTx.wait();
      logger.success('C tokens approved');
    }
    const sAllowance = await sTokenContract.allowance(wallet.address, AQUAFLUX_NFT_CONTRACT);
    if (sAllowance < requiredAmount) {
      logger.step('Approving S tokens...');
      const sApproveTx = await sTokenContract.approve(AQUAFLUX_NFT_CONTRACT, ethers.MaxUint256);
      await sApproveTx.wait();
      logger.success('S tokens approved');
    }
    const csBalanceBefore = await csTokenContract.balanceOf(wallet.address);
    logger.info(`CS Token balance before crafting: ${ethers.formatUnits(csBalanceBefore, 18)}`);
    logger.step("Crafting CS tokens...");
    const CRAFT_METHOD_ID = '0x4c10b523';
    const abiCoder = ethers.AbiCoder.defaultAbiCoder();
    const encodedParams = abiCoder.encode(['uint256'], [requiredAmount]);
    const calldata = CRAFT_METHOD_ID + encodedParams.substring(2);
    const craftTx = await wallet.sendTransaction({
      to: AQUAFLUX_NFT_CONTRACT,
      data: calldata,
      gasLimit: 300000
    });
    logger.success(`Crafting transaction sent! TX Hash: ${craftTx.hash}`);
    const receipt = await craftTx.wait();
    if (receipt.status === 0) throw new Error('Crafting transaction reverted on-chain');
    logger.success('Crafting transaction confirmed.');
    const csBalanceAfter = await csTokenContract.balanceOf(wallet.address);
    const craftedAmount = csBalanceAfter - csBalanceBefore;
    logger.success(`CS Token balance after crafting: ${ethers.formatUnits(csBalanceAfter, 18)}`);
    logger.success(`Successfully crafted: ${ethers.formatUnits(craftedAmount, 18)} CS tokens`);
    if (craftedAmount < requiredAmount) {
      throw new Error(`Crafting incomplete. Expected 100 CS tokens, got ${ethers.formatUnits(craftedAmount, 18)}`);
    }
    return true;
  } catch (e) {
    logger.error(`Craft tokens failed: ${e.reason || e.message}`);
    throw e;
  }
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
function question(query) { return new Promise(resolve => rl.question(query, resolve)); }

(async () => {
  logger.banner();
  const provider = await (await buildFallbackProvider(PHAROS_RPC_URLS, PHAROS_CHAIN_ID, "pharos")).getProvider();
  const privateKeys = loadPrivateKeys();
  const proxies = loadProxies();
  if (!privateKeys.length) {
    logger.error("No private keys! Put PRIVATE_KEY_1, PRIVATE_KEY_2, ... in .env");
    process.exit(1);
  }
  logger.info(`${privateKeys.length} wallet(s) loaded.`);
  const swapCycleStr = await question("Enter number of daily swap cycles: ");
  const numberOfSwapCycles = parseInt(swapCycleStr);
  const liquidityCountStr = await question("Enter number of liquidity adds: ");
  const numberOfLiquidityAdds = parseInt(liquidityCountStr);
  const aquaFluxMintStr = await question("Enter number of AquaFlux mints: ");
  const numberOfMints = parseInt(aquaFluxMintStr);
  const username = await question("Enter X username to tip: ");
  const tipCountStr = await question("Enter number of tips to send: ");
  const numberOfTips = parseInt(tipCountStr);
  const tradeCountStr = await question("Enter number of Long/Short bitverse: ");
  const numberOfTrades = parseInt(tradeCountStr);
  const tradeAmount = await question("Enter USDT amount per trade: ");
  logger.section("Configuration Complete");
  rl.close();
  while (true) {
    for (const [i, pk] of privateKeys.entries()) {
      const wallet = new ethers.Wallet(pk, provider);
      const proxyAgent = getProxyAgent(proxies);
      logger.section(`Processing Wallet ${i + 1}/${privateKeys.length}: ${wallet.address}`);
      
      for (let t = 0; t < numberOfTrades; t++) {
        await executeLongShort(wallet, provider, "long", tradeAmount);
        await executeLongShort(wallet, provider, "short", tradeAmount);
      }
      if (numberOfMints > 0) {
        await executeAquaFluxFlow(wallet, proxyAgent);
      }
      if (numberOfSwapCycles > 0) {
        await batchSwap(wallet, numberOfSwapCycles, proxyAgent);
      }
      if (numberOfLiquidityAdds > 0) {
        for (let l = 0; l < numberOfLiquidityAdds; l++) {
          await addLiquidity(wallet);
        }
      }
      if (username && numberOfTips > 0) {
        for (let t = 0; t < numberOfTips; t++) {
          await sendTip(wallet, username);
        }
      }
      logger.success(`All tasks finished for ${wallet.address}`);
    }
    logger.step("All wallets processed. Waiting for next cycle...");
    await showCountdown();
  }
})().catch((err) => {
  logger.critical(`Fatal error: ${err?.stack || err?.message || err}`);
  process.exit(1);
});
