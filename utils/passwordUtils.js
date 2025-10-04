exports.generateRandomPassword = (length = 12) => {
  const UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  const LOWERCASE = "abcdefghijklmnopqrstuvwxyz";
  const NUMBERS = "0123456789";
  const SYMBOLS = "!@#$%^&*";
  const ALL_CHARS = UPPERCASE + LOWERCASE + NUMBERS + SYMBOLS;

  const getRandomChar = (chars) =>
    chars.charAt(Math.floor(Math.random() * chars.length));

  // Đảm bảo có ít nhất 1 ký tự từ mỗi loại
  let passwordChars = [
    getRandomChar(UPPERCASE),
    getRandomChar(LOWERCASE),
    getRandomChar(NUMBERS),
    getRandomChar(SYMBOLS),
  ];

  // Thêm ký tự ngẫu nhiên cho đủ độ dài
  while (passwordChars.length < length) {
    passwordChars.push(getRandomChar(ALL_CHARS));
  }

  // Trộn thứ tự ký tự
  for (let i = passwordChars.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [passwordChars[i], passwordChars[j]] = [passwordChars[j], passwordChars[i]];
  }

  return passwordChars.join("");
};

exports.generateRandomPin = (length = 6) =>
  Math.floor(
    10 ** (length - 1) + Math.random() * 9 * 10 ** (length - 1)
  ).toString();
