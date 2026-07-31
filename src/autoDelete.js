function scheduleAutoDelete(target, ms = 60000) {
    if (!target) return;
    const t = setTimeout(() => {
        target.delete().catch(() => {});
    }, ms);
    if (t.unref) t.unref();
}

module.exports = { scheduleAutoDelete };
