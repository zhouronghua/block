'use strict';

const config = require('./config.js');

// 积分规则：金币 + 通关 + 隐藏关奖励 + 速度奖励 - 死亡惩罚
function computeScore(run) {
  const rule = config.SCORE;
  const coins = Math.max(0, Math.floor(run.coins || 0));
  const levels = Math.max(0, Math.floor(run.levelsCleared || 0));
  const deaths = Math.max(0, Math.floor(run.deaths || 0));
  const seconds = Math.max(0, Math.floor(run.seconds || 0));

  const coinScore = coins * rule.COIN;
  const levelScore = levels * rule.LEVEL;
  const hiddenScore = run.hiddenCleared ? rule.HIDDEN : 0;
  const timeScore = Math.max(0, rule.TIME_BASE - seconds * rule.TIME_DECAY);
  const penalty = deaths * rule.DEATH;

  const total = Math.round(coinScore + levelScore + hiddenScore + timeScore - penalty);
  return {
    total: Math.max(0, Math.min(rule.MAX, total)),
    parts: {
      coinScore: coinScore,
      levelScore: levelScore,
      hiddenScore: hiddenScore,
      timeScore: timeScore,
      penalty: penalty
    }
  };
}

module.exports = { computeScore: computeScore };
