try {
    const { default: husky } = await import('husky');
    console.log(husky());
} catch (error) {
    if (error?.code !== 'ERR_MODULE_NOT_FOUND') throw error;
}
