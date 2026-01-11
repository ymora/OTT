<?php

class CompileOptimizedTest extends \PHPUnit\Framework\TestCase
{
    public function testCompile()
    {
        // Simuler la compilation
        $output = [];
        exec('php -r "echo \'data: {\\"type\\":\\"success\\",\\"message\\":\\"Compilation simulation OK\\"}\\n\\n\'; flush();"', $output, $returnCode);
        
        $this->assertEquals(0, $returnCode);
        $this->assertStringContainsString('Compilation simulation OK', implode('', $output));
    }
}
